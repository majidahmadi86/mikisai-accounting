import { z } from "zod";

/** One extracted order. Kept flat and nullable so the model can emit compact JSON. */
export const ParsedOrderSchema = z.object({
  order_id: z.string().nullable().describe("Platform order number if visible, else null"),
  date: z.string().nullable().describe("Order or payout date as YYYY-MM-DD, else null"),
  customer_name: z.string().nullable().describe("Buyer name or username if visible, else null"),
  product_line: z.enum(["sugar", "skincare", "other"]).describe("sugar for coconut sugar products, skincare for skincare, other otherwise"),
  gross_amount: z.number().nullable().describe("Total the customer paid in THB, else null"),
  net_amount: z
    .number()
    .nullable()
    .describe("The estimated amount the seller receives after platform fees (ยอดเงินโดยประมาณที่จะได้รับ or similar). null if the report does not show it"),
  status: z.enum(["pending", "settled_not_withdrawn", "received_in_bank"]).describe("Payout status mapped from any wording; pending when unclear"),
  note: z.string().nullable().describe("Short product or line summary, else null"),
  product_name: z.string().nullable().describe("Product name as printed, without variant or quantity, else null"),
  variant: z.string().nullable().describe("Variant or size label as printed (for example 10 kg, 500 g, 30 ml), else null"),
  quantity: z.number().nullable().describe("Units ordered, from wording like x1 or จำนวน 2, else null"),
});

export const ParsedBatchSchema = z.object({
  orders: z.array(ParsedOrderSchema),
  warnings: z.array(z.string()).describe("Anything ambiguous or unreadable, in English"),
});

export type ParsedOrder = z.infer<typeof ParsedOrderSchema>;
export type ParsedBatch = z.infer<typeof ParsedBatchSchema>;

/** A review row is a parsed order with client-side fields the user can edit before saving. */
export type ReviewRow = ParsedOrder & {
  key: string;
  include: boolean;
  net_estimated: boolean;
  platform: "tiktok" | "shopee" | "fb" | "other";
  received_by: "mike" | "sai";
  /** Matched product, or null when the picker must be used. */
  product_id: string | null;
  product_matched: boolean;
};

export type ParseResponse = {
  upload_ids: string[];
  rows: ReviewRow[];
  batches: number;
  warnings: string[];
};
