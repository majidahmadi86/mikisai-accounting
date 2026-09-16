import type { StockMovement } from "./valuation";

export type Uncovered = { transaction_id: string | null; date: string; qty: number };
export type ProductBacklog = { product_id: string; backlog: number; uncovered: Uncovered[] };

function chronological(a: StockMovement, b: StockMovement): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
  return Math.sign(b.qty) - Math.sign(a.qty);
}

/**
 * FIFO backlog per product: units coming in cover the oldest uncovered units
 * going out first. Whatever stays uncovered is the backlog, the "units to buy
 * today". Selling 13 and buying 12 leaves a backlog of 1 whichever came first.
 */
export function fifoBacklog(movements: StockMovement[]): Map<string, ProductBacklog> {
  const out = new Map<string, ProductBacklog>();
  const byProduct = new Map<string, StockMovement[]>();
  for (const m of movements) byProduct.set(m.product_id, [...(byProduct.get(m.product_id) ?? []), m]);
  for (const [productId, list] of byProduct) {
    let onHand = 0;
    const queue: Uncovered[] = [];
    for (const m of [...list].sort(chronological)) {
      if (m.qty > 0) {
        let incoming = m.qty;
        while (incoming > 0 && queue.length) {
          const head = queue[0];
          const take = Math.min(head.qty, incoming);
          head.qty -= take;
          incoming -= take;
          if (head.qty <= 0) queue.shift();
        }
        onHand += incoming;
      } else {
        let out = -m.qty;
        const fromStock = Math.min(onHand, out);
        onHand -= fromStock;
        out -= fromStock;
        if (out > 0) queue.push({ transaction_id: m.transaction_id, date: m.date, qty: out });
      }
    }
    out.set(productId, { product_id: productId, backlog: queue.reduce((a, u) => a + u.qty, 0), uncovered: queue });
  }
  return out;
}

/** How many of the backlog units a purchase of `qty` clears. */
export function coversBacklog(backlog: number, qty: number): { covers: number; of: number } {
  return { covers: Math.max(0, Math.min(backlog, qty)), of: Math.max(0, backlog) };
}
