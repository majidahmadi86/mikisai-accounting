/**
 * One truth, as a build gate (v3.2): `npm run build` runs this file first, so
 * a build fails the moment two pages would show a different who-owes-whom.
 * The case that broke it: Home said Mike owes Sai 3,715 while My Balance said
 * 3,793, a gap of 78, half of the 156 office expense one path did not see.
 */
import { describe, expect, it } from "vitest";
import { consistencyMismatches } from "@/lib/health/checks";
import { CATEGORY_ID } from "@/lib/fixtures/seed-data";
import { LIVE_TODAY, liveLedger } from "@/lib/fixtures/live-shaped";
import { buildMyBalance } from "@/lib/my-balance";
import { thisWeek } from "@/lib/reports/period";
import { whoOwesWhom, type TruthInput } from "@/lib/truth";
import { buildWeek } from "@/lib/week";

const live = (): TruthInput => ({ ...liveLedger(), items: liveLedger().items ?? [] });

const withOffice = (): TruthInput => {
  const input = live();
  const office = { id: "office", type: "expense" as const, date: "2026-09-16", platform: "other" as const, product_line: "sugar" as const, gross_amount: 156, net_amount: 156, quantity: 1, payer: "sai" as const, received_by: null, category_id: CATEGORY_ID.packaging, customer_name: null, note: "For paper and wrapping", created_at: "2026-09-16T10:00:00Z", settlement: null };
  return { ...input, transactions: [...input.transactions, office] };
};

function everywhere(input: TruthInput, today: string) {
  const home = whoOwesWhom(input, today).owes;
  const mine = buildMyBalance({ transactions: input.transactions, transfers: input.transfers, settings: [], exposureLimit: 0 }, "mike", today);
  const myBalance = mine.owedToMe > 0 ? { from: "sai", to: "mike", amount: mine.owedToMe } : mine.iOwe > 0 ? { from: "mike", to: "sai", amount: mine.iOwe } : null;
  const week = buildWeek({ transactions: input.transactions, cancelled: [], cashAdjustments: [], transfers: input.transfers, items: input.items, products: input.products, movements: input.movements, categories: [], facts: [], allocations: [] }, thisWeek(today), today, 5).cash.owes;
  return { home, myBalance, week };
}

describe("consistency gate: Home = My Balance = This week, and every other page", () => {
  it("live-shaped ledger: no page disagrees", () => {
    expect(consistencyMismatches(live(), LIVE_TODAY)).toEqual([]);
  });

  it("the 156 office expense reaches every path: the figure moves by half of it everywhere at once", () => {
    const before = everywhere(live(), LIVE_TODAY);
    const after = everywhere(withOffice(), LIVE_TODAY);
    expect(after.myBalance).toEqual(after.home);
    expect(after.week).toEqual(after.home);
    expect(before.home?.from).toBe("mike");
    // Sai paid 156 more: Mike owes Sai 78 more, on every page.
    expect(after.home!.amount - before.home!.amount).toBeCloseTo(78, 2);
    expect(consistencyMismatches(withOffice(), LIVE_TODAY)).toEqual([]);
  });

  it("the samples expense counts too: without it, the figure differs by 445 on every page alike", () => {
    const input = withOffice();
    const noSamples: TruthInput = { ...input, transactions: input.transactions.filter((t) => t.id !== "smp") };
    const a = everywhere(input, LIVE_TODAY);
    const b = everywhere(noSamples, LIVE_TODAY);
    expect(a.home!.amount - b.home!.amount).toBeCloseTo(445, 2);
    expect(b.week).toEqual(b.home);
    expect(b.myBalance).toEqual(b.home);
  });

  it("the two sides round as one: a half-satang never splits Home from My Balance", () => {
    // Mike holds 0.005 more than half of a result with a half satang in it.
    const input = live();
    const odd = { ...input.transactions[0], id: "odd", type: "expense" as const, date: "2026-09-16", gross_amount: 0.01, net_amount: 0.01, quantity: 1, payer: "sai" as const, received_by: null, category_id: CATEGORY_ID.packaging, settlement: null, order_ref: null };
    const e = everywhere({ ...input, transactions: [...input.transactions, odd] }, LIVE_TODAY);
    expect(e.myBalance).toEqual(e.home);
    expect(e.week).toEqual(e.home);
  });
});
