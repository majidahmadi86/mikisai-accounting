import { describe, expect, it } from "vitest";
import { LIVE_TODAY, liveLedger, BOX_1KG } from "@/lib/fixtures/live-shaped";
import { runHealthChecks } from "@/lib/health/checks";
import { buildInvestment } from "@/lib/investment";
import { summarisePayoutMatches } from "@/lib/payouts/flags";
import { stockPositions, type TruthInput } from "@/lib/truth";

const live = (): TruthInput => ({ ...liveLedger(), items: liveLedger().items ?? [] });

describe("cascade integrity", () => {
  it("a deleted purchase takes its movement with it: stock drops and Investment agrees", () => {
    const input = live();
    const before = stockPositions(input).find((p) => p.product.id === BOX_1KG)!;
    expect([before.bought, before.sold, before.onHand]).toEqual([20, 20, 0]);
    // Deleting buy2 removes the row and, with the cascade, its movement and line.
    const after: TruthInput = { ...input, transactions: input.transactions.filter((t) => t.id !== "buy2"), movements: input.movements.filter((m) => m.transaction_id !== "buy2"), items: input.items.filter((i) => i.transaction_id !== "buy2") };
    const pos = stockPositions(after).find((p) => p.product.id === BOX_1KG)!;
    expect([pos.bought, pos.sold, pos.backlog]).toEqual([0, 20, 20]);
    // Investment: Sai put in 9,210 minus the 5,200 that no longer exists.
    expect(buildInvestment(after, LIVE_TODAY).byPerson.sai).toBe(9210 - 5200);
    expect(runHealthChecks({ ...after, audit: null }, LIVE_TODAY).checks.find((c) => c.key === "orphan_movements")!.count).toBe(0);
  });

  it("a movement left behind by a deleted transaction is reported as a stock move without a live payment", () => {
    const input = live();
    const orphaned: TruthInput = { ...input, transactions: input.transactions.filter((t) => t.id !== "buy2") };
    const check = runHealthChecks({ ...orphaned, audit: null }, LIVE_TODAY).checks.find((c) => c.key === "orphan_movements")!;
    expect(check.count).toBe(2); // the movement and the line
    expect(check.issues[0].label).toContain("purchase +20");
  });

  it("restoring the purchase brings the units back", () => {
    const input = live();
    const restored: TruthInput = { ...input };
    expect(stockPositions(restored).find((p) => p.product.id === BOX_1KG)!.bought).toBe(20);
  });

  it("a sale deleted after being matched flags its payout with the unallocated amount", () => {
    const summary = summarisePayoutMatches([
      { payout_id: "p1", deleted_at: null, net_amount: 377 },
      { payout_id: "p1", deleted_at: null, net_amount: 754 },
      { payout_id: "p1", deleted_at: "2026-09-18T01:00:00Z", net_amount: 377 },
      { payout_id: null, deleted_at: null, net_amount: 99 },
    ]);
    expect(summary.get("p1")).toEqual({ count: 2, total: 1131, removed: 1, unallocated: 377 });
  });

  it("duplicate order numbers are found per platform through order_ref, not the note", () => {
    const input = live();
    const dup = { ...input.transactions[1], id: "dup", note: "" };
    const withDup: TruthInput = { ...input, transactions: [...input.transactions, dup] };
    const check = runHealthChecks({ ...withDup, audit: null }, LIVE_TODAY).checks.find((c) => c.key === "duplicate_order_ids")!;
    expect(check.count).toBe(2);
    expect(check.issues[0].label).toBe(`#${dup.order_ref}`);
  });
});
