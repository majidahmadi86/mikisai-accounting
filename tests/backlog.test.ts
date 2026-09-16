import { describe, expect, it } from "vitest";
import { coversBacklog, fifoBacklog } from "@/lib/inventory/backlog";
import type { StockMovement } from "@/lib/inventory/valuation";

function sale(id: string, qty: number, day: number): StockMovement {
  return { id, product_id: "box", qty: -qty, kind: "sale", unit_cost: null, transaction_id: id, date: `2026-09-${String(day).padStart(2, "0")}`, created_at: `2026-09-${String(day).padStart(2, "0")}T09:00:00Z` };
}

describe("buy-to-order backlog", () => {
  it("sell 13 (5 x 1, 4 x 2), buy 12: backlog 1, the newest sale is the uncovered one", () => {
    const sales = [1, 1, 1, 1, 1, 2, 2, 2, 2].map((q, i) => sale(`o${i + 1}`, q, 15));
    const buy: StockMovement = { id: "buy", product_id: "box", qty: 12, kind: "purchase", unit_cost: 260, transaction_id: "buy", date: "2026-09-16", created_at: "2026-09-16T08:00:00Z" };
    const result = fifoBacklog([...sales, buy]).get("box")!;
    expect(result.backlog).toBe(1);
    expect(result.uncovered).toEqual([{ transaction_id: "o9", date: "2026-09-15", qty: 1 }]);
  });

  it("purchases before sales are consumed from stock first", () => {
    const buy: StockMovement = { id: "buy", product_id: "box", qty: 12, kind: "purchase", unit_cost: 260, transaction_id: "buy", date: "2026-09-10", created_at: "2026-09-10T08:00:00Z" };
    const sales = [1, 1, 1, 1, 1, 2, 2, 2, 2].map((q, i) => sale(`o${i + 1}`, q, 15));
    expect(fifoBacklog([buy, ...sales]).get("box")!.backlog).toBe(1);
  });

  it("a purchase of 5 against a backlog of 13 covers 5 of 13", () => {
    expect(coversBacklog(13, 5)).toEqual({ covers: 5, of: 13 });
    expect(coversBacklog(1, 12)).toEqual({ covers: 1, of: 1 });
    expect(coversBacklog(0, 3)).toEqual({ covers: 0, of: 0 });
  });
});
