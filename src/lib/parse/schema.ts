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
  order_status: z.enum(["active", "cancelled", "refunded"]).nullable().default(null).describe("cancelled when the order was cancelled, refunded when money went back to the buyer, active otherwise, null when unclear"),
  note: z.string().nullable().describe("Short product or line summary, else null"),
  product_name: z.string().nullable().describe("Product name as printed, without variant or quantity, else null"),
  variant: z.string().nullable().describe("Variant or size label as printed (for example 10 kg, 500 g, 30 ml), else null"),
  quantity: z.number().nullable().describe("Units ordered, from wording like x1 or จำนวน 2, else null"),
});

/** A payout or withdrawal seen on a wallet or balance screen. */
export const ParsedPayoutSchema = z.object({
  date: z.string().nullable().describe("The day the money was paid out or withdrawn, YYYY-MM-DD, else null"),
  amount: z.number().describe("Amount paid out in THB"),
  note: z.string().nullable().describe("Wording printed with it, for example Withdrawal or โอนเข้าบัญชี"),
});

export const ParsedBatchSchema = z.object({
  orders: z.array(ParsedOrderSchema),
  payouts: z.array(ParsedPayoutSchema).default([]).describe("Payouts or withdrawals shown on wallet screens; empty when the section shows orders only"),
  warnings: z.array(z.string()).describe("Anything ambiguous or unreadable, in English"),
});

export type ParsedOrder = z.infer<typeof ParsedOrderSchema>;
export type ParsedPayout = z.infer<typeof ParsedPayoutSchema>;
export type ParsedBatch = z.infer<typeof ParsedBatchSchema>;

/** Gold tags on a review row: what the import had to assume or found already in the ledger. */
export const REVIEW_TAGS = ["date_assumed", "qty_inferred", "net_estimated", "already_recorded", "status_change", "cancelled", "refunded"] as const;
export type ReviewTag = (typeof REVIEW_TAGS)[number];

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
  tags: ReviewTag[];
  /** The ledger row with the same order number on the same platform, if any. */
  existing: { id: string; date: string; net_amount: number; status: "active" | "cancelled" | "refunded" } | null;
};

/** A payout to create on confirm, with the FIFO match it would make. */
export type PayoutRow = {
  key: string;
  include: boolean;
  date: string;
  amount: number;
  platform: "tiktok" | "shopee" | "fb" | "other";
  received_by: "mike" | "sai";
  note: string;
  matched_orders: number;
  matched_total: number;
  /** Pending clawbacks on the platform this payout would offset. */
  clawback_offset: number;
};

export type ParseResponse = {
  upload_ids: string[];
  rows: ReviewRow[];
  payouts: PayoutRow[];
  batches: number;
  warnings: string[];
  /** Set by the table import: what the file looked like and how its columns were read. */
  table?: { file_type: "orders" | "finance"; headers: string[]; mapping: Record<string, string>; rows: number };
};
