import { productFullName } from "@/lib/inventory/units";
import type { Period } from "@/lib/reports/period";
import { marginVsPlan, type MarginPlan } from "./product-stats";
import { productProfitability, valueStock, type Product, type ProductProfit, type ProductStock, type StockMovement, type Valuation } from "./valuation";

export type TransactionItemRow = { transaction_id: string; product_id: string; qty: number; unit_price: number; unit_cost: number | null };

export type InventoryInput = {
  products: Product[];
  movements: StockMovement[];
  items: TransactionItemRow[];
  sales: { id: string; date: string; net_amount: number }[];
  /** Expense rows in the period, for the samples card; when absent, samples come from the movements. */
  expenses?: { id: string; category_id: string | null; net_amount: number }[];
  categories?: { id: string; stock_effect: string }[];
  /** Platform fee used for the default expected net per unit. */
  feePct?: number;
};

export type SamplesRow = { product: Product; qty: number; cost: number };

/**
 * Samples given, from the Samples-category expense rows in the period, at
 * what each row cost the business (cash paid, minus units brought in, plus
 * units taken out at the average). This is the same number the profit and
 * loss charges, so the two cards can never differ. A row's cost is spread
 * over its lines by qty x cost per unit (or equally when no costs are set).
 */
export function samplesFromExpenses(
  expenses: { id: string; category_id: string | null; net_amount: number }[],
  categories: { id: string; stock_effect: string }[],
  items: TransactionItemRow[],
  products: Product[],
  valuation: Valuation,
): { rows: SamplesRow[]; total: number } {
  const sampleCats = new Set(categories.filter((c) => c.stock_effect === "sample").map((c) => c.id));
  const byId = new Map(products.map((p) => [p.id, p]));
  const acc = new Map<string, { qty: number; cost: number }>();
  let total = 0;
  for (const e of expenses) {
    if (!e.category_id || !sampleCats.has(e.category_id)) continue;
    const cost = Math.round((e.net_amount - (valuation.purchaseByTransaction.get(e.id) ?? 0) + (valuation.sampleCostByTransaction.get(e.id) ?? 0)) * 100) / 100;
    total += cost;
    const lines = items.filter((i) => i.transaction_id === e.id && byId.has(i.product_id));
    if (!lines.length) continue;
    const weights = lines.map((l) => l.qty * (l.unit_cost ?? 0));
    const weightSum = weights.reduce((a, b) => a + b, 0);
    let spread = 0;
    lines.forEach((l, i) => {
      const share = i === lines.length - 1 ? Math.round((cost - spread) * 100) / 100 : Math.round(cost * (weightSum > 0 ? weights[i] / weightSum : 1 / lines.length) * 100) / 100;
      spread += share;
      const cur = acc.get(l.product_id) ?? { qty: 0, cost: 0 };
      acc.set(l.product_id, { qty: cur.qty + l.qty, cost: Math.round((cur.cost + share) * 100) / 100 });
    });
  }
  return { rows: Array.from(acc.entries()).map(([pid, v]) => ({ product: byId.get(pid)!, qty: v.qty, cost: v.cost })), total: Math.round(total * 100) / 100 };
}

export type InventoryReports = {
  valuation: Valuation;
  stock: ProductStock[];
  lowStock: ProductStock[];
  profitability: ProductProfit[];
  marginPlan: MarginPlan[];
  samples: SamplesRow[];
  samplesTotal: number;
};

export function productLabel(p: Pick<Product, "name" | "name_en" | "name_th" | "variant">, locale: "en" | "th" = "en"): string {
  const name = productFullName(p, locale);
  return p.variant ? `${name} · ${p.variant}` : name;
}

/** Stock on hand today, low stock, profitability and samples for the period. */
export function buildInventoryReports(input: InventoryInput, period: Period): InventoryReports {
  const valuation = valueStock(input.products, input.movements);
  const periodValuation = valueStock(input.products, input.movements, { from: period.from, upTo: period.to });
  const stock = valuation.products.filter((p) => p.product.active || p.onHand !== 0).sort((a, b) => b.value - a.value);
  const profitability = productProfitability(valuation, input.items, input.sales, period);
  const samples = input.expenses && input.categories ? samplesFromExpenses(input.expenses, input.categories, input.items, input.products, periodValuation) : null;
  return {
    valuation,
    stock,
    lowStock: stock.filter((p) => p.low),
    profitability: profitability,
    marginPlan: marginVsPlan(profitability, input.feePct ?? 0),
    samples: samples ? samples.rows : periodValuation.products.filter((p) => p.samplesQty > 0).map((p) => ({ product: p.product, qty: p.samplesQty, cost: p.samplesCost })),
    samplesTotal: samples ? samples.total : Math.round(periodValuation.products.reduce((a, p) => a + p.samplesCost, 0) * 100) / 100,
  };
}
