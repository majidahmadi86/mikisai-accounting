import { round2 } from "@/lib/money";
import { addDays } from "@/lib/reports/period";
import type { TransactionItemRow } from "./reports";
import { type Product, type ProductStock, type StockMovement } from "./valuation";

export const UNIT_LABELS = ["box", "bag", "pack", "piece", "bottle"] as const;
export type UnitLabel = (typeof UNIT_LABELS)[number];

export type ListPrices = Partial<Record<"tiktok" | "shopee" | "fb", number>>;

/** The sale price to prefill for a product on a platform: the platform list price if set, else the standard price. */
export function salePriceFor(product: Pick<Product, "default_price" | "list_prices">, platform: string): number {
  const list = (product.list_prices ?? {}) as ListPrices;
  const p = list[platform as keyof ListPrices];
  return typeof p === "number" && p > 0 ? p : product.default_price;
}

export type ProductDetailStats = {
  onHand: number;
  avgCost: number;
  standardCost: number;
  /** Average minus standard; positive means stock cost more than planned. */
  costVariance: number;
  costVariancePct: number | null;
  sold7: number;
  sold30: number;
  revenue30: number;
  cogs30: number;
  grossMargin30: number;
  lastPurchase: string | null;
  lastSale: string | null;
};

type Sale = { id: string; date: string; net_amount: number };

export function productDetailStats(
  stock: ProductStock,
  items: TransactionItemRow[],
  sales: Sale[],
  movements: StockMovement[],
  cogsByTransaction: Map<string, number>,
  today: string,
): ProductDetailStats {
  const product = stock.product;
  const from7 = addDays(today, -6);
  const from30 = addDays(today, -29);
  const saleById = new Map(sales.map((s) => [s.id, s]));
  let sold7 = 0;
  let sold30 = 0;
  let revenue30 = 0;
  let cogs30 = 0;
  for (const item of items.filter((i) => i.product_id === product.id)) {
    const sale = saleById.get(item.transaction_id);
    if (!sale || sale.date > today) continue;
    if (sale.date >= from7) sold7 += item.qty;
    if (sale.date >= from30) {
      sold30 += item.qty;
      const txItems = items.filter((i) => i.transaction_id === item.transaction_id);
      const listTotal = txItems.reduce((a, i) => a + i.qty * i.unit_price, 0);
      const share = listTotal > 0 ? (item.qty * item.unit_price) / listTotal : 1 / txItems.length;
      revenue30 += sale.net_amount * share;
      cogs30 += (cogsByTransaction.get(item.transaction_id) ?? 0) * share;
    }
  }
  const mine = movements.filter((m) => m.product_id === product.id);
  const lastPurchase = mine.filter((m) => m.kind === "purchase").map((m) => m.date).sort().pop() ?? null;
  const lastSale = mine.filter((m) => m.kind === "sale").map((m) => m.date).sort().pop() ?? null;
  const variance = round2(stock.avgCost - product.default_cost);
  return {
    onHand: stock.onHand,
    avgCost: stock.avgCost,
    standardCost: product.default_cost,
    costVariance: variance,
    costVariancePct: product.default_cost > 0 ? round2((variance / product.default_cost) * 100) : null,
    sold7,
    sold30,
    revenue30: round2(revenue30),
    cogs30: round2(cogs30),
    grossMargin30: round2(revenue30 - cogs30),
    lastPurchase,
    lastSale,
  };
}

export type MarginPlan = {
  product: Product;
  qty: number;
  /** What a unit is expected to bring in after fees: the admin-set figure, else standard price x (1 - platform fee). */
  expectedNetPerUnit: number;
  /** What a unit actually brought in: revenue received divided by units. */
  realizedNetPerUnit: number | null;
  /** Expected net per unit minus standard cost, times units sold. */
  expectedMargin: number;
  /** What actually happened: revenue received minus cost at moving average. */
  actualMargin: number;
  variance: number;
  variancePct: number | null;
  /** Actual is worse than expected by more than 5%. */
  worse: boolean;
};

export const MARGIN_ALERT_PCT = 5;

/** The net a unit is expected to bring in: the admin-set figure, else the standard price less the platform fee. */
export function expectedNetPerUnit(product: Pick<Product, "expected_net_per_unit" | "default_price">, feePct: number): number {
  if (product.expected_net_per_unit != null && product.expected_net_per_unit > 0) return product.expected_net_per_unit;
  return round2(product.default_price * (1 - Math.max(0, feePct) / 100));
}

export function marginVsPlan(rows: { product: Product; qty: number; grossMargin: number; revenue?: number }[], feePct = 0): MarginPlan[] {
  return rows.map((r) => {
    const net = expectedNetPerUnit(r.product, feePct);
    const expected = round2((net - r.product.default_cost) * r.qty);
    const variance = round2(r.grossMargin - expected);
    const variancePct = expected > 0 ? round2((variance / expected) * 100) : null;
    return {
      product: r.product,
      qty: r.qty,
      expectedNetPerUnit: net,
      realizedNetPerUnit: r.revenue !== undefined && r.qty > 0 ? round2(r.revenue / r.qty) : null,
      expectedMargin: expected,
      actualMargin: r.grossMargin,
      variance,
      variancePct,
      worse: variancePct !== null && variancePct < -MARGIN_ALERT_PCT,
    };
  });
}

/** The weekly buy buffer: what the admin set, else 5 for boxes and 0 for anything else. */
export function bufferFor(p: { unit_label: string; buffer_units?: number | null }): number {
  if (p.buffer_units != null && p.buffer_units >= 0) return p.buffer_units;
  return p.unit_label === "box" ? 5 : 0;
}
