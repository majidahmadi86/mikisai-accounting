/**
 * Pure mapping from TikTok Shop API JSON to what the sync needs. No IO.
 */
import { round2 } from "@/lib/money";
import type { TikTokOrder, TikTokPayment, TikTokReturn, TikTokStatementTransaction } from "./types";

export type SyncedLine = { sku_id: string; sku_name: string; product_name: string; seller_sku: string | null; quantity: number; sale_price: number | null };
export type SyncedOrder = { order_ref: string; date: string; updated_at: number; raw_status: string; status: "active" | "cancelled"; buyer_name: string | null; lines: SyncedLine[]; quantity: number; gross_amount: number | null; cancel_reason: string | null; delivered: boolean; unpaid: boolean };
export type SyncedReturn = { order_ref: string; kind: "refunded"; refund_amount: number | null; completed: boolean; date: string; raw_status: string };
export type SyncedPayment = { external_id: string; date: string; amount: number; status: "paid" | "processing" | "failed" };

/** A unix time as the calendar day in Bangkok (UTC+7, no daylight saving). */
export function bangkokDate(unixSeconds: number): string {
  return new Date((unixSeconds + 7 * 3600) * 1000).toISOString().slice(0, 10);
}

export function amount(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined || text === "") return null;
  const n = typeof text === "number" ? text : Number(String(text).replace(/,/g, ""));
  return Number.isFinite(n) ? round2(n) : null;
}

/** TikTok lists one line item per unit; units of the same sku become one line with a quantity. */
export function mapOrder(o: TikTokOrder): SyncedOrder {
  const bySku = new Map<string, SyncedLine>();
  for (const li of o.line_items ?? []) {
    const key = li.sku_id || li.seller_sku || li.product_id || li.id;
    const cur = bySku.get(key);
    if (cur) cur.quantity += 1;
    else bySku.set(key, { sku_id: key, sku_name: li.sku_name ?? "", product_name: li.product_name ?? "", seller_sku: li.seller_sku || null, quantity: 1, sale_price: amount(li.sale_price) });
  }
  const lines = Array.from(bySku.values());
  const status = String(o.status ?? "");
  return {
    order_ref: String(o.id),
    date: bangkokDate(o.paid_time ?? o.create_time),
    updated_at: o.update_time ?? o.create_time,
    raw_status: status,
    status: status === "CANCELLED" ? "cancelled" : "active",
    buyer_name: o.recipient_address?.name?.trim() || o.buyer_email || o.user_id || null,
    lines,
    quantity: lines.reduce((a, l) => a + l.quantity, 0),
    gross_amount: amount(o.payment?.total_amount) ?? amount(o.payment?.sub_total),
    cancel_reason: o.cancel_reason ?? null,
    delivered: status === "DELIVERED" || status === "COMPLETED",
    unpaid: status === "UNPAID",
  };
}

/** Refund requests. A replacement moves no money, so it maps to nothing. */
export function mapReturn(r: TikTokReturn): SyncedReturn | null {
  if (r.return_type === "REPLACEMENT") return null;
  return {
    order_ref: String(r.order_id),
    kind: "refunded",
    refund_amount: amount(r.refund_amount?.refund_total) ?? amount(r.refund_amount?.refund_subtotal),
    completed: r.return_status === "RETURN_OR_REFUND_REQUEST_COMPLETE",
    date: bangkokDate(r.update_time ?? r.create_time ?? 0),
    raw_status: r.return_status,
  };
}

/** What the seller receives per order, from statement transactions of type ORDER. */
export function mapStatementTransactions(txs: TikTokStatementTransaction[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== "ORDER" || !t.order_id) continue;
    const v = amount(t.settlement_amount);
    if (v === null) continue;
    out.set(t.order_id, round2((out.get(t.order_id) ?? 0) + v));
  }
  return out;
}

export function mapPayment(p: TikTokPayment): SyncedPayment | null {
  const value = amount(p.amount?.value) ?? amount(p.settlement_amount?.value);
  if (value === null || value <= 0) return null;
  const at = p.paid_time ?? p.create_time;
  if (!at) return null;
  const status = p.status === "PAID" ? "paid" : p.status === "FAILED" ? "failed" : "processing";
  return { external_id: String(p.id), date: bangkokDate(at), amount: value, status };
}
