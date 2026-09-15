import { describe, expect, it } from "vitest";
import { buildParts, DEFAULT_GEMINI_MODEL, geminiModel, parseModelJson, RESPONSE_JSON_SCHEMA, SYSTEM_PROMPT } from "@/lib/parse/gemini";
import { ParsedBatchSchema } from "@/lib/parse/schema";

describe("Gemini extraction setup", () => {
  it("keeps the estimated-payout rule in the system prompt", () => {
    expect(SYSTEM_PROMPT).toContain("ยอดเงินโดยประมาณ");
    expect(SYSTEM_PROMPT).toContain("Estimated amount you receive");
    expect(SYSTEM_PROMPT).toContain("Never put the customer-paid total");
    expect(SYSTEM_PROMPT).toContain("net_amount must be null");
  });

  it("maps every settlement status in the prompt", () => {
    for (const s of ["pending", "settled_not_withdrawn", "received_in_bank"]) expect(SYSTEM_PROMPT).toContain(s);
  });

  it("derives the response schema from the Zod schema", () => {
    const schema = RESPONSE_JSON_SCHEMA as { properties?: Record<string, unknown>; required?: string[] };
    expect(schema.properties).toHaveProperty("orders");
    expect(schema.properties).toHaveProperty("warnings");
    expect(schema.required).toEqual(expect.arrayContaining(["orders", "warnings"]));
  });

  it("uses the default model unless overridden", () => {
    const prev = process.env.MIKISAI_GEMINI_MODEL;
    delete process.env.MIKISAI_GEMINI_MODEL;
    expect(geminiModel()).toBe(DEFAULT_GEMINI_MODEL);
    process.env.MIKISAI_GEMINI_MODEL = "gemini-3.8-flash";
    expect(geminiModel()).toBe("gemini-3.8-flash");
    if (prev === undefined) delete process.env.MIKISAI_GEMINI_MODEL;
    else process.env.MIKISAI_GEMINI_MODEL = prev;
  });

  it("builds text, image and PDF parts", () => {
    expect(buildParts({ kind: "text", text: "Order 1" }, "tiktok")[0].text).toContain("<report>\nOrder 1\n</report>");

    const images = buildParts({ kind: "images", images: [{ media_type: "image/png", data: "AAAA" }, { media_type: "image/jpeg", data: "BBBB" }] }, "shopee");
    expect(images).toHaveLength(3);
    expect(images[0].inlineData).toEqual({ mimeType: "image/png", data: "AAAA" });
    expect(images[2].text).toContain("2 screenshot(s)");

    const pdf = buildParts({ kind: "pdf", data: "CCCC", label: "report.pdf pages 1-3" }, "fb");
    expect(pdf[0].inlineData?.mimeType).toBe("application/pdf");
    expect(pdf[1].text).toContain("report.pdf pages 1-3");
  });

  it("parses fenced and plain JSON replies into the batch schema", () => {
    const reply = { orders: [{ order_id: "1", date: "2026-09-01", customer_name: "Pim", product_line: "sugar", gross_amount: 350, net_amount: 315, status: "pending", note: null }], warnings: [] };
    const plain = parseModelJson(JSON.stringify(reply));
    const fenced = parseModelJson("```json\n" + JSON.stringify(reply) + "\n```");
    expect(ParsedBatchSchema.safeParse(plain).success).toBe(true);
    expect(ParsedBatchSchema.safeParse(fenced).success).toBe(true);
    expect(ParsedBatchSchema.safeParse({ orders: [{ order_id: "1" }], warnings: [] }).success).toBe(false);
  });
});
