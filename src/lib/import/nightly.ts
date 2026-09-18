import type { ReviewRow } from "@/lib/parse/schema";
import type { PlannedPayout, PlannedStatusChange, QueueReason } from "@/lib/tiktok/plan";

/** One dropped file as the server read it. */
export type NightlyFile = { name: string; file_type: "orders" | "finance" | "unknown"; rows: number; headers: string[]; mapping: Record<string, string>; error: "unreadable" | "unknown-file" | "too-many-rows" | "columns-missing" | null; missing: string[] };

export type NightlyPayout = PlannedPayout & { key: string; include: boolean; orders: number; covered_orders: number; covered_amount: number };

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
};

/** Thresholds Data health uses for the nightly routine. */
export const NIGHTLY_STALE_HOURS = 36;
