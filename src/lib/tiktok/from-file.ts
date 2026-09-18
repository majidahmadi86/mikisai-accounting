/**
 * Seller Center files in the sync's own shapes. After this step a row from a
 * file and a row from the API are the same thing: SyncedOrder, a settlement
 * per order, SyncedPayment with the orders it paid. planSync cannot tell them
 * apart, so the auto-confirm rule, the dedupe and the status changes are
 * identical by construction.
 */
import type { ImportedOrder, ImportedSettlement } from "@/lib/import/tiktok";
import { round2 } from "@/lib/money";
import type { SyncedOrder, SyncedPayment, SyncedReturn } from "./map";

export type PaymentAllocation = { order_ref: string; amount: number };
export type FilePayment = SyncedPayment & { allocations: PaymentAllocation[] };

const unixOf = (date: string | null) => (date ? Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000) : 0);

/** The key a SKU is remembered under: its TikTok id when the source has one, else its printed name and variant. */
export function skuKey(line: { sku_id?: string | null; product_name?: string | null; sku_name?: string | null }): string {
  const id = line.sku_id?.trim();
  if (id) return `id:${id}`;
  const name = `${line.product_name ?? ""}|${line.sku_name ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
  return `name:${name}`;
}

/** Orders export rows as synced orders. A refund the file reports comes back as a completed return. */
export function ordersFromFile(orders: ImportedOrder[], today: string): { orders: SyncedOrder[]; returns: SyncedReturn[]; missingStatus: string[] } {
  const out: SyncedOrder[] = [];
  const returns: SyncedReturn[] = [];
  const missingStatus: string[] = [];
  for (const o of orders) {
    if (o.status === "unknown") missingStatus.push(o.order_id);
    const lines = new Map<string, SyncedOrder["lines"][number]>();
    for (const l of o.lines) {
      const key = l.sku_id?.trim() || `${l.sku_name}|${l.variant}`;
      const cur = lines.get(key);
      if (cur) cur.quantity += l.quantity;
      else lines.set(key, { sku_id: l.sku_id?.trim() ?? "", sku_name: l.variant, product_name: l.sku_name, seller_sku: null, quantity: l.quantity, sale_price: l.unit_price });
    }
    const list = Array.from(lines.values());
    const date = o.paid_at ?? o.created_at ?? o.delivered_at ?? today;
    const unpaid = /unpaid|ยังไม่ชำระ|รอชำระ/i.test(o.raw_status);
    out.push({
      order_ref: o.order_id,
      date,
      updated_at: unixOf(o.cancelled_at ?? o.delivered_at ?? o.paid_at ?? o.created_at),
      raw_status: o.raw_status,
      status: o.status === "cancelled" ? "cancelled" : "active",
      buyer_name: o.buyer_name,
      lines: list,
      quantity: list.reduce((a, l) => a + l.quantity, 0),
      gross_amount: o.order_amount,
      cancel_reason: null,
      delivered: Boolean(o.delivered_at),
      unpaid,
    });
    if (o.status === "refunded") returns.push({ order_ref: o.order_id, kind: "refunded", refund_amount: o.refund_amount && o.refund_amount > 0 ? o.refund_amount : null, completed: true, date: o.cancelled_at ?? today, raw_status: o.raw_status });
  }
  return { orders: out, returns, missingStatus };
}

/**
 * Finance rows as settlements per order (everything TikTok settles for it,
 * across payouts) and as payments: one per payment id, carrying the orders it
 * paid. An order paid 70% early and 30% later shows up in two payments.
 * Rows without a payment id still count towards the order's settlement.
 */
export function financeFromFile(rows: ImportedSettlement[]): { settlements: Map<string, number>; payments: FilePayment[] } {
  const settlements = new Map<string, number>();
  const byPayment = new Map<string, { date: string | null; declared: number | null; total: number; allocations: Map<string, number> }>();
  for (const r of rows) {
    if (r.type === "order" && r.order_id) settlements.set(r.order_id, round2((settlements.get(r.order_id) ?? 0) + r.amount));
    if (!r.payment_id) continue;
    const p = byPayment.get(r.payment_id) ?? { date: null, declared: null, total: 0, allocations: new Map<string, number>() };
    p.date = p.date ?? r.payout_date ?? r.settled_at;
    p.declared = p.declared ?? r.payout_amount;
    p.total = round2(p.total + r.amount);
    if (r.type === "order" && r.order_id && r.amount > 0) p.allocations.set(r.order_id, round2((p.allocations.get(r.order_id) ?? 0) + r.amount));
    byPayment.set(r.payment_id, p);
  }
  const payments: FilePayment[] = [];
  for (const [id, p] of byPayment) {
    const amount = p.declared && p.declared > 0 ? p.declared : p.total;
    if (!(amount > 0) || !p.date) continue;
    payments.push({ external_id: id, date: p.date, amount: round2(amount), status: "paid", allocations: Array.from(p.allocations, ([order_ref, a]) => ({ order_ref, amount: a })) });
  }
  return { settlements, payments: payments.sort((a, b) => a.date.localeCompare(b.date) || a.external_id.localeCompare(b.external_id)) };
}
