import { describe, expect, it } from "vitest";
import { REAL_TODAY, realLedger } from "@/lib/fixtures/real-sept";
import { runHealthChecks, type HealthInput } from "@/lib/health/checks";
import { coverageGaps, lostTotal, statementHealth, type MoneyFact, type MoneyInput } from "@/lib/health/tiktok-money";
import { buildReports } from "@/lib/reports/build";
import { thisMonth } from "@/lib/reports/period";
import { advanceCashRows, normalizeLedger, whoOwesWhom, type TruthTransfer } from "@/lib/truth";

const fact = (over: Partial<MoneyFact>): MoneyFact => ({ order_ref: "r", kind: "order", transaction_id: "t", settled_date: "2026-09-18", settlement_amount: 308.46, fee_seller_shipping: -45, chargeable_weight_g: 10000, boxes: 1, overweight: false, pre_business: false, ledger_net_before: null, ...over });
const money = (over: Partial<MoneyInput> = {}): MoneyInput => ({ startDate: "2026-09-15", allocations: [], facts: [], periods: [], ...over });

describe("the advance in the truth layer", () => {
  it("is cash in the bank for whoever withdrew it, and never revenue or profit", () => {
    const input = realLedger();
    const transfers = input.transfers as TruthTransfer[];
    const before = whoOwesWhom({ transactions: input.transactions, transfers });
    const cash = advanceCashRows([{ id: "advance:w1", date: "2026-09-16", amount: 500, received_by: "sai" }]);
    const after = whoOwesWhom({ transactions: input.transactions, transfers, cashAdjustments: cash });
    expect(after.fromPlatforms.sai - before.fromPlatforms.sai).toBe(500);
    expect(after.fromPlatforms.mike).toBe(before.fromPlatforms.mike);

    const period = thisMonth(REAL_TODAY);
    const plain = buildReports(input, period);
    const withAdvance = buildReports({ ...input, cashAdjustments: cash }, period);
    expect(withAdvance.accrual.revenue).toBe(plain.accrual.revenue);
    expect(withAdvance.accrual.profit).toBe(plain.accrual.profit);
    expect(withAdvance.byProduct.map((r) => r.net)).toEqual(plain.byProduct.map((r) => r.net));
  });

  it("a recovery after the advance was banked takes the same cash back out", () => {
    const n = normalizeLedger([], [], [{ id: "advance:w1", date: "2026-09-18", amount: 500, received_by: "sai" }, { id: "advance:r1", date: "2026-09-19", amount: -200, received_by: "sai" }]);
    expect(n.transactions).toEqual([]);
    expect(n.cashAdjustments.map((c) => [c.net_amount, c.synthetic, c.settlement?.status])).toEqual([[500, true, "received_in_bank"], [-200, true, "received_in_bank"]]);
  });
});

describe("Data health for the statement", () => {
  const today = "2026-09-21";

  it("lists what the statement corrected, with old and new, for a week", () => {
    const h = statementHealth(money({ facts: [fact({ order_ref: "a", ledger_net_before: 310.82 }), fact({ order_ref: "old", ledger_net_before: 300, settled_date: "2026-09-01" }), fact({ order_ref: "same" })] }), [], undefined, today);
    expect(h.net_fixed.map((i) => [i.id, i.detail])).toEqual([["a", "฿310.82 → ฿308.46"]]);
  });

  it("flags a TikTok order no statement has mentioned after ten days, once statements exist", () => {
    const orders = [
      { id: "t-old", order_ref: "o1", date: "2026-09-05", net_amount: 300, platform: "tiktok", type: "income", status: "active", settlement: { status: "pending" } },
      { id: "t-new", order_ref: "o2", date: "2026-09-18", net_amount: 300, platform: "tiktok", type: "income", status: "active", settlement: { status: "pending" } },
      { id: "t-known", order_ref: "o3", date: "2026-09-05", net_amount: 300, platform: "tiktok", type: "income", status: "active", settlement: { status: "pending" } },
      { id: "t-pre", order_ref: "o4", date: "2026-09-01", net_amount: 300, platform: "tiktok", type: "income", status: "active", settlement: { status: "pending" } },
    ];
    const m = money({ startDate: "2026-09-05", facts: [fact({ order_ref: "o3" })], periods: [{ from: "2026-09-05", to: "2026-09-20" }] });
    expect(statementHealth(m, orders, undefined, today).no_statement_10d.map((i) => i.id)).toEqual(["t-old"]);
    expect(statementHealth({ ...m, periods: [] }, orders, undefined, today).no_statement_10d).toEqual([]);
  });

  it("finds the days no statement covers", () => {
    expect(coverageGaps([{ from: "2026-09-15", to: "2026-09-16" }, { from: "2026-09-19", to: "2026-09-19" }], "2026-09-15", "2026-09-22")).toEqual([{ from: "2026-09-17", to: "2026-09-18", days: 2 }, { from: "2026-09-20", to: "2026-09-21", days: 2 }]);
    expect(coverageGaps([{ from: "2026-09-10", to: "2026-09-21" }], "2026-09-15", "2026-09-22")).toEqual([]);
    expect(coverageGaps([], "2026-09-15", "2026-09-22")).toEqual([]);
  });

  it("counts overweight parcels and return losses this week, in baht", () => {
    const facts = [fact({ order_ref: "n1" }), fact({ order_ref: "n2" }), fact({ order_ref: "heavy", overweight: true, fee_seller_shipping: -81, chargeable_weight_g: 12500, settlement_amount: 272.46 }), fact({ order_ref: "ret", kind: "refund", settlement_amount: -45 }), fact({ order_ref: "pre", overweight: true, pre_business: true, fee_seller_shipping: -90 })];
    const h = statementHealth(money({ facts }), [], undefined, today);
    expect(h.overweight_week.map((i) => i.id)).toEqual(["heavy"]);
    expect(lostTotal(h.overweight_week)).toBe(36);
    expect(h.returns_week.map((i) => i.id)).toEqual(["ret"]);
    expect(lostTotal(h.returns_week)).toBe(45);
  });

  it("lists the advance estimate and the two-file cross-check", () => {
    const h = statementHealth(money({ allocations: [{ order_ref: "u1", date: "2026-09-19", amount: 210 }] }), [], { missing_from_orders: ["x1"], missing_from_statement: ["y1", 7] }, today);
    expect(h.advance_estimated.map((i) => [i.id, i.detail])).toEqual([["u1", "฿210.00"]]);
    expect(h.statement_cross.map((i) => i.id)).toEqual(["s:x1", "o:y1"]);
  });

  it("stays quiet on a ledger that has never seen a statement", () => {
    const input = realLedger();
    const base: HealthInput = { ...input, items: input.items ?? [], transfers: input.transfers as TruthTransfer[], audit: { rows: [], roles: new Map() } };
    const keys = runHealthChecks(base, REAL_TODAY).checks.filter((c) => ["net_fixed", "no_statement_10d", "statement_cross", "advance_estimated", "statement_gaps", "overweight_week", "returns_week"].includes(c.key));
    expect(keys).toHaveLength(7);
    expect(keys.every((c) => c.count === 0)).toBe(true);
  });

  it("does not call a withdrawal unmatched for the advance or the pre-business money it carried", () => {
    const input = realLedger();
    const base: HealthInput = { ...input, items: input.items ?? [], transfers: input.transfers as TruthTransfer[], audit: { rows: [], roles: new Map() } };
    const payout = { id: "po-w", date: "2026-09-18", platform: "tiktok" as const, amount_received: 1390.92, received_by: "sai" as const, note: "", external_ref: "8800", non_order_amount: 810 };
    const withPayout = { ...base, payouts: [...base.payouts, payout], payoutCoverage: { "po-w": 580.92 } };
    expect(runHealthChecks(withPayout, REAL_TODAY).checks.find((c) => c.key === "payout_not_matched")!.count).toBe(0);
    const unexplained = { ...withPayout, payouts: [...base.payouts, { ...payout, non_order_amount: 0 }] };
    expect(runHealthChecks(unexplained, REAL_TODAY).checks.find((c) => c.key === "payout_not_matched")!.count).toBe(1);
  });
});
