import { round2 } from "@/lib/money";

export const STOCK_MOVEMENT_KINDS = ["purchase", "sale", "sample", "adjustment", "return"] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export type Product = {
  id: string;
  name: string;
  name_th: string;
  product_line: "sugar" | "skincare" | "other";
  variant: string;
  unit_label: string;
  /** Standard (planned) cost per unit. */
  default_cost: number;
  /** Standard sale price per unit. */
  default_price: number;
  /** Optional per-platform list prices: { tiktok, shopee, fb }. */
  list_prices: Record<string, number>;
  low_stock_threshold: number;
  active: boolean;
  photo_path: string | null;
  notes: string;
  deleted_at?: string | null;
};

export type StockMovement = {
  id: string;
  product_id: string;
  /** Positive brings units in, negative takes them out. */
  qty: number;
  kind: StockMovementKind;
  /** Cost per unit for purchases (and optional for returns and adjustments in). */
  unit_cost: number | null;
  transaction_id: string | null;
  date: string;
  created_at: string;
};

export type ProductStock = {
  product: Product;
  onHand: number;
  avgCost: number;
  value: number;
  /** Cost of units sold, at the average cost when each sale happened. */
  cogs: number;
  /** Cost of units given away as samples. */
  samplesCost: number;
  samplesQty: number;
  soldQty: number;
  purchasedQty: number;
  purchasedValue: number;
  low: boolean;
};

export type Valuation = {
  products: ProductStock[];
  /** Cost of goods sold per sale transaction, at the average cost at that time. */
  cogsByTransaction: Map<string, number>;
  /** Cost of samples per expense transaction. */
  sampleCostByTransaction: Map<string, number>;
  totalValue: number;
  totalCogs: number;
};

function chronological(a: StockMovement, b: StockMovement): number {
  return a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date);
}

/**
 * Moving average cost. Walks each product's movements in date order:
 * units coming in with a cost re-average the stock; units going out are
 * charged at the average of that moment. Quantities can go negative if a
 * sale is recorded before its purchase; the average then holds at the last
 * known cost so the numbers stay explainable.
 */
export function valueStock(products: Product[], movements: StockMovement[], opts: { upTo?: string; from?: string } = {}): Valuation {
  const cogsByTransaction = new Map<string, number>();
  const sampleCostByTransaction = new Map<string, number>();
  const rows: ProductStock[] = [];

  for (const product of products) {
    if (product.deleted_at) continue;
    const list = movements.filter((m) => m.product_id === product.id && (!opts.upTo || m.date <= opts.upTo)).sort(chronological);
    let onHand = 0;
    let avg = product.default_cost > 0 ? product.default_cost : 0;
    let cogs = 0;
    let samplesCost = 0;
    let samplesQty = 0;
    let soldQty = 0;
    let purchasedQty = 0;
    let purchasedValue = 0;

    for (const m of list) {
      const inPeriod = !opts.from || m.date >= opts.from;
      if (m.qty > 0) {
        const cost = m.unit_cost ?? avg;
        const total = onHand > 0 ? onHand * avg + m.qty * cost : m.qty * cost;
        onHand += m.qty;
        avg = onHand > 0 ? total / onHand : cost;
        if (m.kind === "purchase" && inPeriod) {
          purchasedQty += m.qty;
          purchasedValue += m.qty * cost;
        }
      } else {
        const out = -m.qty;
        const cost = out * avg;
        onHand -= out;
        if (m.kind === "sale") {
          if (inPeriod) {
            cogs += cost;
            soldQty += out;
          }
          if (m.transaction_id) cogsByTransaction.set(m.transaction_id, round2((cogsByTransaction.get(m.transaction_id) ?? 0) + cost));
        } else if (m.kind === "sample") {
          if (inPeriod) {
            samplesCost += cost;
            samplesQty += out;
          }
          if (m.transaction_id) sampleCostByTransaction.set(m.transaction_id, round2((sampleCostByTransaction.get(m.transaction_id) ?? 0) + cost));
        }
      }
    }

    rows.push({
      product,
      onHand: round3(onHand),
      avgCost: round2(avg),
      value: round2(Math.max(0, onHand) * avg),
      cogs: round2(cogs),
      samplesCost: round2(samplesCost),
      samplesQty: round3(samplesQty),
      soldQty: round3(soldQty),
      purchasedQty: round3(purchasedQty),
      purchasedValue: round2(purchasedValue),
      low: product.active && onHand <= product.low_stock_threshold,
    });
  }

  return {
    products: rows,
    cogsByTransaction,
    sampleCostByTransaction,
    totalValue: round2(rows.reduce((a, r) => a + r.value, 0)),
    totalCogs: round2(rows.reduce((a, r) => a + r.cogs, 0)),
  };
}

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export type ProductProfit = {
  product: Product;
  qty: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  marginPct: number | null;
};

/** Revenue and cost per product for the sales in a period. */
export function productProfitability(
  valuation: Valuation,
  items: { transaction_id: string; product_id: string; qty: number; unit_price: number }[],
  sales: { id: string; date: string; net_amount: number }[],
  period: { from: string; to: string },
): ProductProfit[] {
  const saleById = new Map(sales.filter((s) => s.date >= period.from && s.date <= period.to).map((s) => [s.id, s]));
  const byProduct = new Map<string, { qty: number; revenue: number; cogs: number }>();
  const movementsByTx = new Map<string, number>();
  for (const [txId, cogs] of valuation.cogsByTransaction) movementsByTx.set(txId, cogs);

  for (const item of items) {
    const sale = saleById.get(item.transaction_id);
    if (!sale) continue;
    const cur = byProduct.get(item.product_id) ?? { qty: 0, revenue: 0, cogs: 0 };
    cur.qty += item.qty;
    // Revenue is what the seller receives, split across the items by list price.
    const txItems = items.filter((i) => i.transaction_id === item.transaction_id);
    const listTotal = txItems.reduce((a, i) => a + i.qty * i.unit_price, 0);
    const share = listTotal > 0 ? (item.qty * item.unit_price) / listTotal : 1 / txItems.length;
    cur.revenue += sale.net_amount * share;
    cur.cogs += (movementsByTx.get(item.transaction_id) ?? 0) * share;
    byProduct.set(item.product_id, cur);
  }

  return valuation.products
    .filter((p) => byProduct.has(p.product.id))
    .map((p) => {
      const v = byProduct.get(p.product.id)!;
      const revenue = round2(v.revenue);
      const cogs = round2(v.cogs);
      const grossMargin = round2(revenue - cogs);
      return { product: p.product, qty: round3(v.qty), revenue, cogs, grossMargin, marginPct: revenue > 0 ? round2((grossMargin / revenue) * 100) : null };
    })
    .sort((a, b) => b.grossMargin - a.grossMargin);
}
