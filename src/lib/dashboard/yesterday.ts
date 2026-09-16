import type { TransactionItemRow } from "@/lib/inventory/reports";
import { valueStock, type Product, type StockMovement } from "@/lib/inventory/valuation";
import { round2 } from "@/lib/money";
import { addDays } from "@/lib/reports/period";

export type YesterdayInput = {
  transactions: { id: string; type: "income" | "expense"; date: string; net_amount: number }[];
  items: TransactionItemRow[];
  products: Product[];
  movements: StockMovement[];
};

export type Yesterday = {
  date: string;
  orders: number;
  revenue: number;
  units: number;
  perProduct: { product: Product; units: number }[];
  toBuy: { product: Product; units: number }[];
};

/** Yesterday's sales per product and today's purchase backlog. */
export function buildYesterday(input: YesterdayInput, today: string): Yesterday {
  const date = addDays(today, -1);
  const sales = input.transactions.filter((t) => t.type === "income" && t.date === date);
  const ids = new Set(sales.map((s) => s.id));
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const per = new Map<string, number>();
  for (const it of input.items) if (ids.has(it.transaction_id)) per.set(it.product_id, (per.get(it.product_id) ?? 0) + it.qty);
  const perProduct = Array.from(per.entries())
    .filter(([pid]) => byId.has(pid))
    .map(([pid, units]) => ({ product: byId.get(pid)!, units }))
    .sort((a, b) => b.units - a.units);
  const toBuy = valueStock(input.products, input.movements)
    .products.filter((r) => r.backlog > 0)
    .map((r) => ({ product: r.product, units: r.backlog }))
    .sort((a, b) => b.units - a.units);
  return {
    date,
    orders: sales.length,
    revenue: round2(sales.reduce((a, s) => a + s.net_amount, 0)),
    units: perProduct.reduce((a, r) => a + r.units, 0),
    perProduct,
    toBuy,
  };
}
