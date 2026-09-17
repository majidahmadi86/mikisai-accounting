import { fifoBacklog } from "./backlog";
import type { TransactionItemRow } from "./reports";
import { valueStock, type Product, type ProductStock, type StockMovement, type StockMovementKind } from "./valuation";

export type StockCard = {
  stock: ProductStock;
  bought: number;
  sold: number;
  samples: number;
  lastPurchase: string | null;
  toBuy: number;
};

export type MovementRow = {
  id: string;
  date: string;
  created_at: string;
  product: Product;
  kind: StockMovementKind;
  qty: number;
  /** Cost per unit for units in; sale price per unit for a sale line; null otherwise. */
  perUnit: number | null;
  who: string | null;
  transaction_id: string | null;
  note: string;
};

export type StockInput = {
  products: Product[];
  movements: StockMovement[];
  items: TransactionItemRow[];
  names: Map<string, string>;
};

export type StockFilter = { product?: string | null; from?: string | null; to?: string | null };

/** One card per active product with the four big numbers, and the movement history newest first. */
export function buildStockPage(input: StockInput, filter: StockFilter = {}): { cards: StockCard[]; history: MovementRow[] } {
  const valuation = valueStock(input.products, input.movements);
  const backlog = fifoBacklog(input.movements);
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const cards = valuation.products
    .filter((r) => r.product.active || r.onHand !== 0)
    .map((r): StockCard => {
      const mine = input.movements.filter((m) => m.product_id === r.product.id);
      const purchases = mine.filter((m) => m.kind === "purchase");
      return {
        stock: r,
        bought: purchases.reduce((a, m) => a + m.qty, 0),
        sold: mine.filter((m) => m.kind === "sale").reduce((a, m) => a - m.qty, 0),
        samples: mine.filter((m) => m.kind === "sample").reduce((a, m) => a - m.qty, 0),
        lastPurchase: purchases.map((m) => m.date).sort().pop() ?? null,
        toBuy: backlog.get(r.product.id)?.backlog ?? 0,
      };
    })
    .sort((a, b) => Number(b.stock.product.active) - Number(a.stock.product.active) || a.stock.product.name.localeCompare(b.stock.product.name) || a.stock.product.variant.localeCompare(b.stock.product.variant));

  const priceOf = new Map<string, number>();
  for (const it of input.items) priceOf.set(`${it.transaction_id}:${it.product_id}`, it.unit_price);
  const history = input.movements
    .filter((m) => byId.has(m.product_id))
    .filter((m) => !filter.product || m.product_id === filter.product)
    .filter((m) => !filter.from || m.date >= filter.from)
    .filter((m) => !filter.to || m.date <= filter.to)
    .map(
      (m): MovementRow => ({
        id: m.id,
        date: m.date,
        created_at: m.created_at,
        product: byId.get(m.product_id)!,
        kind: m.kind,
        qty: m.qty,
        perUnit: m.qty > 0 ? m.unit_cost : m.kind === "sale" && m.transaction_id ? (priceOf.get(`${m.transaction_id}:${m.product_id}`) ?? null) : null,
        who: m.created_by ? (input.names.get(m.created_by) ?? null) : null,
        transaction_id: m.transaction_id,
        note: m.note ?? "",
      }),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  return { cards, history };
}
