/**
 * Cleaning the ledger against what TikTok's own Orders file says. Pure: rows
 * in, a plan out. The same duplicate rule feeds Data health on every import.
 *
 * - Two live rows with one order number: keep the imported one.
 * - A row typed by hand with no order number that matches an imported order
 *   (date within a day, same units, customer paid or you receive within ฿5) is
 *   the same sale: keep the imported row, carry the note, remove the typed one.
 *   A typed row that matches nothing waits for the admin; it is never removed.
 * - An order the file shows cancelled with no shipped time was never a sale.
 * - Each sale sits on the variant its TikTok listing really sells.
 */
import { round2 } from "@/lib/money";

export const DUP_AMOUNT = 5;
export const DUP_DAYS = 1;

export type CleanRow = {
  id: string;
  date: string;
  order_ref: string | null;
  quantity: number;
  gross_amount: number;
  net_amount: number;
  status: "active" | "cancelled" | "refunded";
  tags: string[];
  note: string;
  items: { product_id: string; qty: number }[];
  /** Brought in by a file, a statement or the API (not typed). */
  imported: boolean;
};

export type FileOrder = { order_ref: string; cancelled: boolean; shipped: boolean; lines: { sku_id: string; qty: number }[] };
export type SkuTarget = { product_id: string | null; multiplier: number };

export type CleanupPlan = {
  exactDuplicates: { keep: string; remove: string[]; order_ref: string }[];
  merges: { keep: string; remove: string; order_ref: string; note: string; why: string }[];
  unmatched: { id: string; date: string; quantity: number; gross_amount: number; net_amount: number }[];
  cancelBeforeShipping: { id: string; order_ref: string }[];
  remaps: { id: string; order_ref: string; from: string; to: string }[];
};

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/** How close a typed row is to an imported one; null when they are not the same sale under the rule. */
export function duplicateScore(typed: Pick<CleanRow, "date" | "quantity" | "gross_amount" | "net_amount">, imported: Pick<CleanRow, "date" | "quantity" | "gross_amount" | "net_amount">): number | null {
  if (dayDiff(typed.date, imported.date) > DUP_DAYS) return null;
  if (typed.quantity !== imported.quantity) return null;
  const gross = Math.abs(typed.gross_amount - imported.gross_amount);
  const net = Math.abs(typed.net_amount - imported.net_amount);
  if (gross > DUP_AMOUNT && net > DUP_AMOUNT) return null;
  // What the customer paid is read off the order page; what you receive on a typed row was only an estimate.
  return round2(Math.min(gross, DUP_AMOUNT + net) + dayDiff(typed.date, imported.date) * 0.01);
}

export function planCleanup(rows: CleanRow[], orders: Map<string, FileOrder>, skus: Map<string, SkuTarget>): CleanupPlan {
  const plan: CleanupPlan = { exactDuplicates: [], merges: [], unmatched: [], cancelBeforeShipping: [], remaps: [] };
  const removed = new Set<string>();

  const byRef = new Map<string, CleanRow[]>();
  for (const r of rows) if (r.order_ref) byRef.set(r.order_ref, [...(byRef.get(r.order_ref) ?? []), r]);
  for (const [ref, group] of byRef) {
    if (group.length < 2) continue;
    const keep = [...group].sort((a, b) => Number(b.imported) - Number(a.imported) || Number(b.status === "active") - Number(a.status === "active") || a.date.localeCompare(b.date))[0];
    const remove = group.filter((r) => r.id !== keep.id).map((r) => r.id);
    remove.forEach((id) => removed.add(id));
    plan.exactDuplicates.push({ keep: keep.id, remove, order_ref: ref });
  }

  // Typed rows against imported ones, closest first, each imported row claimed once.
  const typed = rows.filter((r) => !r.order_ref && !removed.has(r.id));
  // Any row with an order number can absorb a typed row: it is the one an import can recognise.
  const candidates = rows.filter((r) => r.order_ref && !removed.has(r.id));
  const pairs: { t: CleanRow; i: CleanRow; score: number }[] = [];
  for (const t of typed) for (const i of candidates) {
    const score = duplicateScore(t, i);
    if (score !== null) pairs.push({ t, i, score: score + (i.status === "active" ? 0 : 1000) });
  }
  pairs.sort((a, b) => a.score - b.score || a.i.date.localeCompare(b.i.date));
  const usedT = new Set<string>();
  const usedI = new Set<string>();
  for (const p of pairs) {
    if (usedT.has(p.t.id) || usedI.has(p.i.id)) continue;
    usedT.add(p.t.id);
    usedI.add(p.i.id);
    const why = Math.abs(p.t.gross_amount - p.i.gross_amount) <= DUP_AMOUNT ? `customer paid ${p.t.gross_amount} and ${p.i.gross_amount}` : `you receive ${p.t.net_amount} and ${p.i.net_amount}`;
    plan.merges.push({ keep: p.i.id, remove: p.t.id, order_ref: p.i.order_ref as string, note: p.t.note.trim(), why });
  }
  for (const t of typed) if (!usedT.has(t.id)) plan.unmatched.push({ id: t.id, date: t.date, quantity: t.quantity, gross_amount: t.gross_amount, net_amount: t.net_amount });

  for (const r of rows) {
    if (!r.order_ref || removed.has(r.id)) continue;
    const o = orders.get(r.order_ref);
    if (!o) continue;
    if (o.cancelled && !o.shipped && !r.tags.includes("cancelled_before_shipping")) plan.cancelBeforeShipping.push({ id: r.id, order_ref: r.order_ref });
    // The variant the listing sells. Only a one-line order with one known listing is moved; anything else is left alone.
    if (o.lines.length !== 1 || r.items.length !== 1) continue;
    const target = skus.get(`id:${o.lines[0].sku_id}`);
    if (!target?.product_id || target.product_id === r.items[0].product_id) continue;
    plan.remaps.push({ id: r.id, order_ref: r.order_ref, from: r.items[0].product_id, to: target.product_id });
  }
  return plan;
}

/** The Data health rule: typed rows an imported order already covers. */
export function possibleDuplicates(rows: CleanRow[]): CleanupPlan["merges"] {
  return planCleanup(rows, new Map(), new Map()).merges;
}
