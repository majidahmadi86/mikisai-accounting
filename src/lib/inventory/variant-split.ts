/**
 * Purchases require a variant (v3.2). Stock bought before the 500 g packs had
 * their own listing was booked on one variant of a product that has two.
 * These are the purchase rows the admin still has to split, once each: every
 * line sits on a product with exactly one sibling variant (same name), and
 * the row is not yet marked as checked.
 */
import type { ExpenseCategory } from "@/lib/categories";
import type { Product } from "@/lib/inventory/valuation";

export const SPLIT_TAG = "variant_checked";

export type SplitRow = { id: string; date: string; amount: number; qty: number; from: string; to: string; unit_cost: number };

type Tx = { id: string; type: string; date: string; net_amount: number; category_id: string | null; tags: string[] };
type Item = { transaction_id: string; product_id: string; qty: number; unit_cost: number | null };

export function siblingOf(product: Pick<Product, "id" | "name">, products: Pick<Product, "id" | "name" | "active">[]): string | null {
  const same = products.filter((p) => p.id !== product.id && p.active && p.name === product.name);
  return same.length === 1 ? same[0].id : null;
}

export function purchasesToSplit(transactions: Tx[], items: Item[], products: Product[], categories: Pick<ExpenseCategory, "id" | "stock_effect">[]): SplitRow[] {
  const purchase = new Set(categories.filter((c) => c.stock_effect === "purchase").map((c) => c.id));
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: SplitRow[] = [];
  for (const t of transactions) {
    if (t.type !== "expense" || !purchase.has(t.category_id ?? "") || t.tags.includes(SPLIT_TAG)) continue;
    const lines = items.filter((i) => i.transaction_id === t.id);
    const ids = [...new Set(lines.map((l) => l.product_id))];
    if (ids.length !== 1) continue;
    const product = byId.get(ids[0]);
    const to = product ? siblingOf(product, products) : null;
    if (!product || !to) continue;
    const qty = lines.reduce((a, l) => a + l.qty, 0);
    if (qty <= 0) continue;
    const unit_cost = lines.find((l) => l.unit_cost != null && l.unit_cost > 0)?.unit_cost ?? Math.round((t.net_amount / qty) * 100) / 100;
    out.push({ id: t.id, date: t.date, amount: t.net_amount, qty, from: product.id, to, unit_cost });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
