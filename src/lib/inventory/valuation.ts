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
  /** Admin-set short label for ledger rows and chips, for example "1 kg packs". */
  short_name: string;
  /** What a unit really brings in after fees and discounts; null means standard price x (1 - platform fee). */
  expected_net_per_unit: number | null;
  /** buy_to_order: sold before bought, negative stock is a backlog. stocked: must never go negative. */
  stock_mode: StockMode;
  deleted_at?: string | null;
};

export const STOCK_MODES = ["buy_to_order", "stocked"] as const;
export type StockMode = (typeof STOCK_MODES)[number];

export type StockMovement = {
  id: string;
  product_id: string;
  created_by?: string | null;
  note?: string;
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
  /** Stock on hand at cost; zero when the product is in backlog. */
  value: number;
  /** Units sold or given away that no purchase has covered yet (buy-to-order backlog). */
  backlog: number;
  /** Cost already charged for the backlog units, carried as a liability until they are bought. */
  backlogValue: number;
  /** Signed book value: what went in at cost minus what went out at the average. Equals value minus backlogValue. */
  bookValue: number;
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
  /** Value of units brought in per transaction (stock purchases, and samples bought for giving away). */
  purchaseByTransaction: Map<string, number>;
  /** Net cost of manual corrections and returns in the period: units out at average minus units in at cost. */
  correctionsCost: number;
  totalValue: number;
  totalBacklogValue: number;
  /** Sum of book values: inventory minus backlog liability. */
  totalBookValue: number;
  totalCogs: number;
};

/** Date, then creation time; on an exact tie units coming in go first so a bought-and-given sample nets to zero. */
function chronological(a: StockMovement, b: StockMovement): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
  return Math.sign(b.qty) - Math.sign(a.qty);
}

/**
 * Moving average cost. Walks each product's movements in date order:
 * units coming in with a cost re-average the stock; units going out are
 * charged at the average of that moment. Quantities go negative when a sale
 * is recorded before its purchase (buy to order): the average then holds at
 * the last known cost, the cost charged is carried as a backlog liability,
 * and the next purchase settles it through the signed book value, so
 * inventory minus backlog always equals purchases minus what went out.
 */
export function valueStock(products: Product[], movements: StockMovement[], opts: { upTo?: string; from?: string } = {}): Valuation {
  const cogsByTransaction = new Map<string, number>();
  const sampleCostByTransaction = new Map<string, number>();
  const purchaseByTransaction = new Map<string, number>();
  const rows: ProductStock[] = [];
  let correctionsCost = 0;

  for (const product of products) {
    if (product.deleted_at) continue;
    const list = movements.filter((m) => m.product_id === product.id && (!opts.upTo || m.date <= opts.upTo)).sort(chronological);
    let onHand = 0;
    let avg = product.default_cost > 0 ? product.default_cost : 0;
    let book = 0;
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
        book += m.qty * cost;
        onHand += m.qty;
        avg = onHand > 0 ? Math.max(0, book / onHand) : cost;
        if (m.kind === "purchase") {
          if (inPeriod) {
            purchasedQty += m.qty;
            purchasedValue += m.qty * cost;
          }
          if (m.transaction_id) purchaseByTransaction.set(m.transaction_id, round2((purchaseByTransaction.get(m.transaction_id) ?? 0) + m.qty * cost));
        } else if (m.kind === "return" && m.transaction_id) {
          // Units back from a cancelled or refunded sale: the sale's cost of goods comes back with them.
          if (inPeriod) {
            cogs -= m.qty * cost;
            soldQty -= m.qty;
          }
          cogsByTransaction.set(m.transaction_id, round2((cogsByTransaction.get(m.transaction_id) ?? 0) - m.qty * cost));
        } else if (inPeriod) {
          correctionsCost -= m.qty * cost;
        }
      } else {
        const out = -m.qty;
        const cost = out * avg;
        book -= cost;
        onHand -= out;
        if (m.kind === "adjustment" || m.kind === "return") {
          if (inPeriod) correctionsCost += cost;
        }
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
      value: onHand > 0 ? round2(Math.max(0, book)) : 0,
      backlog: onHand < 0 ? round3(-onHand) : 0,
      backlogValue: onHand < 0 ? round2(Math.max(0, -book)) : 0,
      bookValue: round2(book),
      cogs: round2(cogs),
      samplesCost: round2(samplesCost),
      samplesQty: round3(samplesQty),
      soldQty: round3(soldQty),
      purchasedQty: round3(purchasedQty),
      purchasedValue: round2(purchasedValue),
      // Low stock only means something for a product you keep on the shelf.
      low: product.active && product.stock_mode === "stocked" && onHand <= product.low_stock_threshold,
    });
  }

  return {
    products: rows,
    cogsByTransaction,
    sampleCostByTransaction,
    purchaseByTransaction,
    correctionsCost: round2(correctionsCost),
    totalValue: round2(rows.reduce((a, r) => a + r.value, 0)),
    totalBacklogValue: round2(rows.reduce((a, r) => a + r.backlogValue, 0)),
    totalBookValue: round2(rows.reduce((a, r) => a + r.bookValue, 0)),
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
