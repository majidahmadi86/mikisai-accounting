/**
 * What one sync will do, decided without touching the database: which orders
 * go straight into the ledger, which wait for a person, which existing
 * orders change status, which payouts to record. The same review model as the
 * CSV import builds the rows, so the rules cannot drift apart.
 */
import type { ExistingOrder } from "@/lib/import/review";
import { reviewRowsFor, type FeeSettings, type ImportProduct } from "@/lib/import/server";
import type { CommitRow } from "@/lib/import/commit";
import type { ParsedOrder, ReviewRow } from "@/lib/parse/schema";
import type { Person } from "@/lib/types";
import type { SyncedOrder, SyncedPayment, SyncedReturn } from "./map";

export type QueueReason = "no_settlement" | "product_unmatched" | "multiple_products" | "no_quantity" | "no_amount";
export type PlannedStatusChange = { transaction_id: string; order_ref: string; order_status: "cancelled" | "refunded"; date: string; refund_amount: number | null };
export type PlannedPayout = { date: string; platform: "tiktok"; amount: number; received_by: Person; note: string; external_ref: string };
export type SyncPlan = {
  auto: CommitRow[];
  queue: { order_ref: string; row: ReviewRow; reasons: QueueReason[] }[];
  statusChanges: PlannedStatusChange[];
  payouts: PlannedPayout[];
  /** Already in the ledger and unchanged. */
  skipped: number;
  /** Not a sale: unpaid orders, and cancelled orders that were never recorded. */
  ignored: number;
};

export type PlanInput = {
  orders: SyncedOrder[];
  returns: SyncedReturn[];
  /** What the seller receives per order, from finance statements. */
  settlements: Map<string, number>;
  payments: SyncedPayment[];
  ctx: { products: ImportProduct[]; settings: FeeSettings };
  existing: Map<string, ExistingOrder>;
  receivedBy: Person;
  today: string;
};

function toParsed(o: SyncedOrder, net: number | null, refund: SyncedReturn | undefined): ParsedOrder {
  const first = o.lines[0];
  return {
    order_id: o.order_ref,
    date: o.date,
    customer_name: o.buyer_name,
    product_line: "sugar",
    gross_amount: o.gross_amount,
    net_amount: net,
    status: net != null ? "settled_not_withdrawn" : "pending",
    order_status: refund ? "refunded" : o.status,
    note: o.lines.map((l) => `${l.product_name}${l.sku_name ? ` ${l.sku_name}` : ""} x${l.quantity}`).join(", ") || null,
    product_name: first?.product_name ?? null,
    variant: first?.sku_name ?? null,
    quantity: o.quantity > 0 ? o.quantity : null,
  };
}

export function planSync(input: PlanInput): SyncPlan {
  const plan: SyncPlan = { auto: [], queue: [], statusChanges: [], payouts: [], skipped: 0, ignored: 0 };
  const refunds = new Map<string, SyncedReturn>();
  for (const r of input.returns) if (r.completed && (r.refund_amount ?? 0) > 0) refunds.set(r.order_ref, r);
  const seen = new Set<string>();

  for (const o of input.orders) {
    if (seen.has(o.order_ref)) continue;
    seen.add(o.order_ref);
    const existing = input.existing.get(o.order_ref) ?? null;
    const refund = refunds.get(o.order_ref);

    if (existing) {
      if (existing.status === "active" && o.status === "cancelled") plan.statusChanges.push({ transaction_id: existing.id, order_ref: o.order_ref, order_status: "cancelled", date: input.today, refund_amount: null });
      else if (existing.status === "active" && refund) plan.statusChanges.push({ transaction_id: existing.id, order_ref: o.order_ref, order_status: "refunded", date: refund.date, refund_amount: refund.refund_amount });
      else plan.skipped += 1;
      continue;
    }
    if (o.unpaid || o.status === "cancelled") {
      plan.ignored += 1;
      continue;
    }

    const net = input.settlements.get(o.order_ref) ?? null;
    const [row] = reviewRowsFor([toParsed(o, net, refund)], "tiktok", input.receivedBy, input.ctx, new Map(), input.today);
    const reasons: QueueReason[] = [];
    if (net == null) reasons.push("no_settlement");
    if (o.lines.length > 1) reasons.push("multiple_products");
    if (!row.product_id) reasons.push("product_unmatched");
    if (!row.quantity) reasons.push("no_quantity");
    if (row.gross_amount == null) reasons.push("no_amount");
    if (reasons.length) {
      plan.queue.push({ order_ref: o.order_ref, row: { ...row, refund_amount: refund ? refund.refund_amount : null }, reasons });
      continue;
    }
    plan.auto.push({
      date: row.date as string,
      platform: "tiktok",
      product_line: row.product_line,
      gross_amount: row.gross_amount as number,
      net_amount: row.net_amount as number,
      received_by: input.receivedBy,
      status: "settled_not_withdrawn",
      customer_name: row.customer_name,
      order_id: o.order_ref,
      note: row.note,
      product_id: row.product_id as string,
      quantity: row.quantity as number,
      tags: [],
      order_status: refund ? "refunded" : "active",
      refund_amount: refund ? refund.refund_amount : null,
    });
  }

  // A refund for an order already in the ledger whose order did not come back in this window.
  for (const [ref, refund] of refunds) {
    if (seen.has(ref)) continue;
    const existing = input.existing.get(ref);
    if (existing && existing.status === "active") plan.statusChanges.push({ transaction_id: existing.id, order_ref: ref, order_status: "refunded", date: refund.date, refund_amount: refund.refund_amount });
  }

  for (const p of input.payments) {
    if (p.status !== "paid") continue;
    plan.payouts.push({ date: p.date, platform: "tiktok", amount: p.amount, received_by: input.receivedBy, note: `TikTok payment ${p.external_id}`, external_ref: p.external_id });
  }
  return plan;
}
