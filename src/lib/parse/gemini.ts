import "server-only";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { z } from "zod";
import { ParsedBatchSchema, type ParsedBatch } from "./schema";
import type { Platform } from "@/lib/types";

export type ImageInput = { media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };

export type BatchInput =
  | { kind: "text"; text: string }
  | { kind: "images"; images: ImageInput[] }
  | { kind: "pdf"; data: string; label: string };

/**
 * gemini-2.0-flash was retired by Google; the API names gemini-3.6-flash as
 * its replacement. Override with MIKISAI_GEMINI_MODEL if Google retires this one too.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

export function geminiModel(): string {
  return process.env.MIKISAI_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/** Stable system instruction, identical for every batch of a report. */
export const SYSTEM_PROMPT = `You extract e-commerce orders from Thai and English sales reports, order lists, payout statements and receipts produced by TikTok Shop, Shopee and Facebook for a small Thai brand (MikiSai) that sells coconut sugar and skincare. Reports may be pasted text, screenshots or PDF pages, often in Thai.

Return only JSON that matches the provided schema. Emit one item per order. Never merge two orders into one item and never split one order into two. Never invent an order that is not on the report. If the same order appears twice (for example an order line and its receipt), emit it once.

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

8. Skip cancelled, refunded or returned orders entirely and mention each skipped order id in warnings. Also add a warning for any order whose amounts were unreadable. Warnings are short English sentences. If there are no warnings return an empty array.

Read Thai carefully. Digits printed with Thai numerals (๐-๙) are converted to Arabic numerals.`;

/** JSON schema handed to Gemini as responseJsonSchema, derived from the same Zod schema used to validate the reply. */
export const RESPONSE_JSON_SCHEMA = z.toJSONSchema(ParsedBatchSchema);

function getClient(): GoogleGenAI {
  const apiKey = process.env.MIKISAI_GEMINI;
  if (!apiKey) throw new Error("MIKISAI_GEMINI is not set");
  return new GoogleGenAI({ apiKey });
}

export function buildParts(input: BatchInput, platform: Platform): Part[] {
  const intro = `Platform: ${platform}. Extract every order in this report section.`;
  if (input.kind === "text") {
    return [{ text: `${intro}\n\n<report>\n${input.text}\n</report>` }];
  }
  if (input.kind === "images") {
    return [
      ...input.images.map((img): Part => ({ inlineData: { mimeType: img.media_type, data: img.data } })),
      { text: `${intro} The images above are ${input.images.length} screenshot(s) of the report.` },
    ];
  }
  return [
    { inlineData: { mimeType: "application/pdf", data: input.data } },
    { text: `${intro} The document above is "${input.label}", part of the report.` },
  ];
}

/** Strips a ```json fence if the model wrapped its answer, then parses. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

/** One Gemini call for one batch of at most ~20 orders. Callers paginate. */
export async function extractBatch(input: BatchInput, platform: Platform): Promise<ParsedBatch> {
  const ai = getClient();
  const contents: Content[] = [{ role: "user", parts: buildParts(input, platform) }];

  const response = await ai.models.generateContent({
    model: geminiModel(),
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) {
    const reason = response.candidates?.[0]?.finishReason ?? "no candidates";
    return { orders: [], warnings: [`The model returned no result for this section (${reason}).`] };
  }

  let raw: unknown;
  try {
    raw = parseModelJson(text);
  } catch {
    return { orders: [], warnings: ["The model returned malformed JSON for this section."] };
  }

  const parsed = ParsedBatchSchema.safeParse(raw);
  if (!parsed.success) {
    return { orders: [], warnings: ["The model returned a result that did not match the expected shape for this section."] };
  }
  return parsed.data;
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
