import { describe, expect, it } from "vitest";
import { isWithinTolerance, proposeFifoMatch, type MatchCandidate } from "@/lib/fifo";
import { SEED_PAYOUT, SEED_TRANSACTIONS } from "@/lib/fixtures/seed-data";

function c(id: string, date: string, net: number, created = "2026-09-01T00:00:00Z"): MatchCandidate {
  return { settlement_id: id, transaction_id: `tx-${id}`, date, created_at: created, net_amount: net };
}

describe("proposeFifoMatch", () => {
  it("matches the seeded TikTok payout to the two oldest TikTok orders exactly", () => {
    const candidates = SEED_TRANSACTIONS.filter((t) => t.type === "income" && t.platform === "tiktok").map((t) => c(t.ref, t.date, t.net_amount));
    const p = proposeFifoMatch(candidates, SEED_PAYOUT.amount_received);
    expect(p.matched).toBe(true);
    expect(p.selectedIds).toEqual(SEED_PAYOUT.matches);
    expect(p.total).toBe(783);
    expect(p.difference).toBe(0);
  });

  it("walks oldest first regardless of input order", () => {
    const p = proposeFifoMatch([c("c", "2026-09-03", 30), c("a", "2026-09-01", 10), c("b", "2026-09-02", 20)], 30);
    expect(p.selectedIds).toEqual(["a", "b"]);
    expect(p.matched).toBe(true);
  });

  it("accepts a total within ±2%", () => {
    const p = proposeFifoMatch([c("a", "2026-09-01", 100), c("b", "2026-09-02", 100)], 203);
    expect(p.matched).toBe(true);
    expect(p.selectedIds).toEqual(["a", "b"]);
    expect(p.difference).toBe(-3);
  });

  it("returns the closest prefix when nothing lands within tolerance", () => {
    const p = proposeFifoMatch([c("a", "2026-09-01", 100), c("b", "2026-09-02", 100), c("c", "2026-09-03", 100)], 250);
    expect(p.matched).toBe(false);
    // 200 and 300 are equally close; the earlier prefix wins because the later one is not strictly closer.
    expect(p.selectedIds).toEqual(["a", "b"]);
    expect(p.total).toBe(200);
  });

  it("proposes nothing when even the oldest order overshoots more than an empty selection", () => {
    const p = proposeFifoMatch([c("a", "2026-09-01", 500), c("b", "2026-09-02", 10)], 100);
    expect(p.matched).toBe(false);
    expect(p.selectedIds).toEqual([]);
    expect(p.difference).toBe(-100);
  });

  it("handles no candidates", () => {
    const p = proposeFifoMatch([], 100);
    expect(p.matched).toBe(false);
    expect(p.selectedIds).toEqual([]);
    expect(p.total).toBe(0);
  });
});

describe("isWithinTolerance", () => {
  it("is inclusive at the boundary", () => {
    expect(isWithinTolerance(102, 100)).toBe(true);
    expect(isWithinTolerance(98, 100)).toBe(true);
    expect(isWithinTolerance(102.01, 100)).toBe(false);
  });
});
