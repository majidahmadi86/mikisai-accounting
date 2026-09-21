import type { ReviewRow } from "@/lib/parse/schema";
import type { PlannedPayout, PlannedStatusChange, QueueReason } from "@/lib/tiktok/plan";

/** One dropped file as the server read it. */
export type NightlyFile = { name: string; file_type: "orders" | "finance" | "statement" | "unknown"; /** A Finance statement says which days it covers. */ period?: { from: string; to: string } | null; rows: number; headers: string[]; mapping: Record<string, string>; error: "unreadable" | "unknown-file" | "too-many-rows" | "columns-missing" | null; missing: string[] };

export type NightlyPayout = PlannedPayout & { key: string; include: boolean; orders: number; covered_orders: number; covered_amount: number };

/** What a TikTok Finance statement will do, shown before confirm. Nothing here is saved by the review. */
export type StatementReview = {
  period: { from: string; to: string } | null;
  rows: number;
  /** Orders the statement settles: real amount, "Paid by TikTok, still in wallet". */
  settle: number;
  /** Settled orders the ledger does not have yet and no Orders file in this drop brings. */
  create: number;
  fixed: { order_ref: string; old: number; new: number }[];
  refunds: { order_ref: string; loss: number }[];
  overweight: { order_ref: string; chargeable_weight_g: number; boxes: number; net: number }[];
  needs_product: { order_ref: string; skus: string[] }[];
  pre_business: { count: number; total: number };
  advance: { balance: number; disbursed: number; recovered: number };
  withdrawals: { reference: string; date: string; amount: number; bank_suffix: string; orders: number; advance: number; other: number }[];
  already_known: number;
  /** Settled in the statement but absent from the Orders file of the same drop, and the other way round (only when both were dropped). */
  missing_from_orders: string[];
  missing_from_statement: string[];
};

/** The one review the nightly panel shows: what is ready, what needs a look, what changes, what was paid. */
export type NightlyReview = {
  upload_ids: string[];
  files: NightlyFile[];
  /** Complete rows: saved as they are on confirm. */
  ready: ReviewRow[];
  /** Rows the auto-confirm rule would not take: editable, with the reason. */
  review: (ReviewRow & { reasons: QueueReason[] })[];
  status_changes: PlannedStatusChange[];
  payouts: NightlyPayout[];
  skipped: number;
  ignored: number;
  known_payments: number;
  missing_status: string[];
  unmapped_skus: { sku_key: string; sku_name: string }[];
  warnings: string[];
  statement: StatementReview | null;
};

/** Thresholds Data health uses for the nightly routine. */
export const NIGHTLY_STALE_HOURS = 36;
