/**
 * Pure helpers shared by every import path (screenshots, pasted text, Seller
 * Center exports): merging the same order seen twice, inferring a missing
 * quantity, and deciding what a row means against the ledger.
 */
import type { ParsedOrder, ParsedPayout, ReviewTag } from "@/lib/parse/schema";
import { round2 } from "@/lib/money";

/** The same order in two screenshots (or two rows) becomes one, keeping the fullest values. */
export function mergeParsedOrders(orders: ParsedOrder[]): ParsedOrder[] {
  const byRef = new Map<string, ParsedOrder>();
  const noRef: ParsedOrder[] = [];
  for (const o of orders) {
    const key = o.order_id?.trim();
    if (!key) {
      noRef.push(o);
      continue;
    }
    const prev = byRef.get(key);
    if (!prev) {
      byRef.set(key, { ...o, order_id: key });
      continue;
    }
    byRef.set(key, {
      order_id: key,
      date: prev.date ?? o.date,
      customer_name: prev.customer_name ?? o.customer_name,
      product_line: prev.product_line !== "other" ? prev.product_line : o.product_line,
      gross_amount: prev.gross_amount ?? o.gross_amount,
      net_amount: prev.net_amount ?? o.net_amount,
      // A later screenshot may show the order further along; keep the most advanced payout status.
      status: rank(o.status) > rank(prev.status) ? o.status : prev.status,
      order_status: prev.order_status && prev.order_status !== "active" ? prev.order_status : (o.order_status ?? prev.order_status),
      note: prev.note ?? o.note,
      product_name: prev.product_name ?? o.product_name,
      variant: prev.variant ?? o.variant,
      quantity: prev.quantity ?? o.quantity,
    });
  }
  return [...byRef.values(), ...noRef];
}

function rank(status: ParsedOrder["status"]): number {
  return status === "received_in_bank" ? 2 : status === "settled_not_withdrawn" ? 1 : 0;
}

/** Same payout twice (two wallet screenshots) becomes one. */
export function mergeParsedPayouts(payouts: ParsedPayout[]): ParsedPayout[] {
  const seen = new Map<string, ParsedPayout>();
  for (const p of payouts) {
    if (!(p.amount > 0)) continue;
    const key = `${p.date ?? "?"}:${round2(p.amount)}`;
    if (!seen.has(key)) seen.set(key, { ...p, amount: round2(p.amount) });
  }
  return [...seen.values()];
}

/**
 * A missing quantity from what the seller receives: net divided by the
 * expected net per unit, accepted only when it lands near a whole number.
 */
export function inferQuantity(net: number | null | undefined, expectedNetPerUnit: number | null | undefined, tolerance = 0.15): number | null {
  if (!net || !expectedNetPerUnit || net <= 0 || expectedNetPerUnit <= 0) return null;
  const ratio = net / expectedNetPerUnit;
  const n = Math.round(ratio);
  if (n < 1 || n > 999) return null;
  return Math.abs(ratio - n) <= tolerance ? n : null;
}

export type ExistingOrder = { id: string; date: string; net_amount: number; status: "active" | "cancelled" | "refunded" };

/** What a parsed order means against the ledger: new, a status change to apply, or a duplicate to skip. */
export function classifyAgainstLedger(orderStatus: ParsedOrder["order_status"], existing: ExistingOrder | null): { tags: ReviewTag[]; include: boolean } {
  const tags: ReviewTag[] = [];
  const wanted = orderStatus ?? "active";
  if (wanted === "cancelled") tags.push("cancelled");
  if (wanted === "refunded") tags.push("refunded");
  if (!existing) return { tags, include: true };
  if (wanted !== "active" && existing.status === "active") {
    tags.push("status_change");
    return { tags, include: true };
  }
  tags.push("already_recorded");
  return { tags, include: false };
}
