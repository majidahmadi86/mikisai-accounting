import type { Period } from "@/lib/reports/period";
import { marginVsPlan, type MarginPlan } from "./product-stats";
import { productProfitability, valueStock, type Product, type ProductProfit, type ProductStock, type StockMovement, type Valuation } from "./valuation";

export type TransactionItemRow = { transaction_id: string; product_id: string; qty: number; unit_price: number; unit_cost: number | null };

export type InventoryInput = {
  products: Product[];
  movements: StockMovement[];
  items: TransactionItemRow[];
  sales: { id: string; date: string; net_amount: number }[];
};

export type SamplesRow = { product: Product; qty: number; cost: number };

export type InventoryReports = {
  valuation: Valuation;
  stock: ProductStock[];
  lowStock: ProductStock[];
  profitability: ProductProfit[];
  marginPlan: MarginPlan[];
  samples: SamplesRow[];
  samplesTotal: number;
};

export function productLabel(p: Pick<Product, "name" | "variant">): string {
  return p.variant ? `${p.name} · ${p.variant}` : p.name;
}

/** Stock on hand today, low stock, profitability and samples for the period. */
export function buildInventoryReports(input: InventoryInput, period: Period): InventoryReports {
  const valuation = valueStock(input.products, input.movements);
  const periodValuation = valueStock(input.products, input.movements, { from: period.from, upTo: period.to });
  const stock = valuation.products.filter((p) => p.product.active || p.onHand !== 0).sort((a, b) => b.value - a.value);
  const profitability = productProfitability(valuation, input.items, input.sales, period);
  return {
    valuation,
    stock,
    lowStock: stock.filter((p) => p.low),
    profitability: profitability,
    marginPlan: marginVsPlan(profitability),
    samples: periodValuation.products.filter((p) => p.samplesQty > 0).map((p) => ({ product: p.product, qty: p.samplesQty, cost: p.samplesCost })),
    samplesTotal: Math.round(periodValuation.products.reduce((a, p) => a + p.samplesCost, 0) * 100) / 100,
  };
}
