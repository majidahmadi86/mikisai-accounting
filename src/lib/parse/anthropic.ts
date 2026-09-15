import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ParsedBatchSchema, type ParsedBatch } from "./schema";
import type { Platform } from "@/lib/types";

export type ImageInput = { media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };

export type BatchInput =
  | { kind: "text"; text: string }
  | { kind: "images"; images: ImageInput[] }
  | { kind: "pdf"; data: string; label: string };

const MODEL = "claude-opus-5";

/**
 * Stable system prompt. Kept byte-identical between calls so the cache
 * breakpoint below is reused across every batch of a report.
 */
const SYSTEM_PROMPT = `You extract e-commerce orders from Thai and English sales reports, order lists, payout statements and receipts produced by TikTok Shop, Shopee and Facebook for a small Thai brand (MikiSai) that sells coconut sugar and skincare. Reports may be pasted text, screenshots or PDF pages, often in Thai.

Return only the structured result. Emit one item per order. Never merge two orders into one item and never split one order into two. Never invent an order that is not on the report. If the same order appears twice (for example an order line and its receipt), emit it once.

Field rules:

1. net_amount is the amount the SELLER receives after platform fees. Use it only when the report shows a line such as:
   - Thai: "ยอดเงินโดยประมาณที่จะได้รับ", "ยอดเงินโดยประมาณ", "ยอดที่ผู้ขายจะได้รับ", "รายได้โดยประมาณ", "ยอดที่ได้รับ", "ยอดตัดยอด", "ยอดสุทธิที่ได้รับ", "รายได้จากคำสั่งซื้อ"
   - English: "Estimated amount you receive", "Estimated settlement amount", "Estimated payout", "Your earnings", "Total settlement amount", "Seller income", "Net payout"
   Never put the customer-paid total, the order subtotal or the product price into net_amount. If no such seller-receives line exists for an order, net_amount must be null; the app estimates it separately.

2. gross_amount is what the customer paid for the order in THB, including shipping if it is part of the order total. Thai wording: "ยอดรวมที่ลูกค้าชำระ", "ยอดชำระ", "ยอดรวมคำสั่งซื้อ", "ราคารวม", "ยอดสั่งซื้อ". English: "Total", "Order total", "Total paid", "Amount paid". Use null when not shown.

3. Amounts are Thai baht. Strip "฿", "บาท", "THB" and thousands separators. Use a plain number with up to two decimals.

4. date is the order date in YYYY-MM-DD. Thai Buddhist Era years (พ.ศ., for example 2568 or 68) must be converted to the Common Era year by subtracting 543. Thai month names and abbreviations (ม.ค., ก.พ., มี.ค., เม.ย., พ.ค., มิ.ย., ก.ค., ส.ค., ก.ย., ต.ค., พ.ย., ธ.ค.) map to January through December. If only a payout date is visible use that. Use null when no date is visible.

5. status maps any payout wording to exactly one of:
   - pending: not yet settled by the platform. Thai: "รอชำระ", "รอการชำระเงิน", "รอโอน", "รอตัดยอด", "กำลังดำเนินการ", "ที่ต้องจัดส่ง", "กำลังจัดส่ง", "จัดส่งแล้ว", "รอยืนยัน". English: "To ship", "Shipping", "Shipped", "In transit", "Pending", "Processing", "Unsettled", "Awaiting settlement".
   - settled_not_withdrawn: platform has settled but money is still in the platform wallet. Thai: "ตัดยอดแล้ว", "ชำระแล้ว", "พร้อมถอน", "ยอดที่ถอนได้", "สำเร็จ", "เสร็จสิ้น". English: "Settled", "Completed", "Available for withdrawal", "In wallet", "Released".
   - received_in_bank: money has reached the bank account. Thai: "โอนแล้ว", "ถอนแล้ว", "เข้าบัญชีแล้ว", "โอนเข้าธนาคารแล้ว". English: "Paid out", "Withdrawn", "Transferred", "Paid to bank".
   When wording is missing or unclear use pending.

6. product_line: "sugar" for coconut sugar, palm sugar, syrup or any น้ำตาล product; "skincare" for cream, serum, soap, lotion, mask, toner, ครีม, เซรั่ม, สบู่, โลชั่น, สกินแคร์; otherwise "other".

7. customer_name is the buyer's display name or username as printed. order_id is the platform order number as printed, without any "#" prefix. note is a short product summary such as "Coconut sugar 500g x2".

8. Skip cancelled, refunded or returned orders entirely and mention each skipped order id in warnings. Also add a warning for any order whose amounts were unreadable. Warnings are short English sentences.

Read Thai carefully. Digits printed with Thai numerals (๐-๙) are converted to Arabic numerals.`;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ maxRetries: 3, timeout: 240_000 });
}

function buildContent(input: BatchInput, platform: Platform): Anthropic.Beta.Messages.BetaContentBlockParam[] {
  const intro = `Platform: ${platform}. Extract every order in this report section.`;
  if (input.kind === "text") {
    return [{ type: "text", text: `${intro}\n\n<report>\n${input.text}\n</report>` }];
  }
  if (input.kind === "images") {
    return [
      ...input.images.map((img): Anthropic.Beta.Messages.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      })),
      { type: "text", text: `${intro} The images above are ${input.images.length} screenshot(s) of the report.` },
    ];
  }
  return [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.data }, title: input.label },
    { type: "text", text: `${intro} The document above is part of the report.` },
  ];
}

/** One Anthropic call for one batch of at most ~20 orders. Callers paginate. */
export async function extractBatch(input: BatchInput, platform: Platform): Promise<ParsedBatch> {
  const client = getClient();

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildContent(input, platform) }],
    output_config: { format: betaZodOutputFormat(ParsedBatchSchema), effort: "medium" },
  });

  if (response.stop_reason === "refusal") {
    return { orders: [], warnings: ["The model declined to read this section."] };
  }
  if (response.stop_reason === "max_tokens") {
    return { orders: response.parsed_output?.orders ?? [], warnings: [...(response.parsed_output?.warnings ?? []), "Output was cut off. Split this section and try again."] };
  }
  return response.parsed_output ?? { orders: [], warnings: ["The model returned no structured result for this section."] };
}

/** Runs batches with bounded concurrency so a long report does not burst the rate limit. */
export async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
