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
import { skuKey, type PaymentAllocation } from "./from-file";

export type QueueReason = "no_settlement" | "product_unmatched" | "multiple_products" | "no_quantity" | "no_amount";
export type PlannedStatusChange = { transaction_id: string; order_ref: string; order_status: "cancelled" | "refunded"; date: string; refund_amount: number | null };
export type PlannedPayout = { date: string; platform: "tiktok"; amount: number; received_by: Person; note: string; external_ref: string; allocations: PaymentAllocation[] };
export type SkuSeen = { sku_key: string; sku_name: string; product_id: string | null; learned: boolean };
export type SyncPlan = {
  auto: CommitRow[];
  /** The same rows as review rows, so a screen can show what will be saved without a second model. */
  autoReview: ReviewRow[];
  queue: { order_ref: string; row: ReviewRow; reasons: QueueReason[] }[];
  statusChanges: PlannedStatusChange[];
  payouts: PlannedPayout[];
  /** Already in the ledger and unchanged. */
  skipped: number;
  /** Not a sale: unpaid orders, and cancelled orders that were never recorded. */
  ignored: number;
  /** SKUs met in this run that the map did not know: matched by name (learned) or awaiting mapping (product_id null). */
  skus: SkuSeen[];
  /** Payments already recorded, skipped by their TikTok payment id. */
  knownPayments: number;
};

export type PlanInput = {
  orders: SyncedOrder[];
  returns: SyncedReturn[];
  /** What the seller receives per order, from finance statements. */
  settlements: Map<string, number>;
  payments: (SyncedPayment & { allocations?: PaymentAllocation[] })[];
  /** TikTok SKU to product, the one map the API sync and the file import share. A null product means awaiting mapping. */
  skuMap?: Map<string, string | null>;
  /** TikTok payment ids already recorded as payouts. */
  knownPaymentIds?: Set<string>;
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
  const plan: SyncPlan = { auto: [], autoReview: [], queue: [], statusChanges: [], payouts: [], skipped: 0, ignored: 0, skus: [], knownPayments: 0 };
  const skuMap = input.skuMap ?? new Map<string, string | null>();
  const skuSeen = new Set<string>();
  const products = new Map(input.ctx.products.map((p) => [p.id, p]));
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
    const [matched] = reviewRowsFor([toParsed(o, net, refund)], "tiktok", input.receivedBy, input.ctx, new Map(), input.today);
    // The SKU map decides first; a name match is only the fallback, and what it finds is remembered.
    const first = o.lines[0];
    const key = first ? skuKey(first) : null;
    const mapped = key && skuMap.has(key) ? skuMap.get(key) ?? null : undefined;
    const mappedProduct = mapped ? products.get(mapped) : undefined;
    const row: ReviewRow = mappedProduct ? { ...matched, product_id: mappedProduct.id, product_line: mappedProduct.product_line, product_matched: true } : mapped === null ? { ...matched, product_id: null, product_matched: false } : matched;
    if (key && mapped === undefined && !skuSeen.has(key)) {
      skuSeen.add(key);
      plan.skus.push({ sku_key: key, sku_name: [first.product_name, first.sku_name].filter(Boolean).join(" · "), product_id: row.product_id, learned: Boolean(row.product_id) });
    }
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
    plan.autoReview.push({ ...row, refund_amount: refund ? refund.refund_amount : null });
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
    if (input.knownPaymentIds?.has(p.external_id)) {
      plan.knownPayments += 1;
      continue;
    }
    plan.payouts.push({ date: p.date, platform: "tiktok", amount: p.amount, received_by: input.receivedBy, note: `TikTok payment ${p.external_id}`, external_ref: p.external_id, allocations: p.allocations ?? [] });
  }
  return plan;
}
