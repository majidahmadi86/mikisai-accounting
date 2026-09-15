import { describe, expect, it } from "vitest";
import { computeBalance, type BalanceTransaction } from "@/lib/balance";
import { EXPECTED_AFTER_PAYOUT, EXPECTED_BEFORE_PAYOUT, SEED_PAYOUT, SEED_TRANSACTIONS, SEED_TRANSFER } from "@/lib/fixtures/seed-data";

function toBalanceTx(afterPayout: boolean): BalanceTransaction[] {
  return SEED_TRANSACTIONS.map((t) => {
    let status = t.status_after_payout;
    if (!afterPayout && SEED_PAYOUT.matches.includes(t.ref)) status = "pending";
    return { type: t.type, platform: t.platform, net_amount: t.net_amount, payer: t.payer, received_by: t.received_by, settlement_status: status };
  });
}

describe("computeBalance", () => {
  it("matches the hand calculation after the payout is reconciled", () => {
    const b = computeBalance(toBalanceTx(true), [SEED_TRANSFER]);
    expect(b.settledIncome).toBe(EXPECTED_AFTER_PAYOUT.settledIncome);
    expect(b.expenses).toBe(EXPECTED_AFTER_PAYOUT.expenses);
    expect(b.netProfit).toBe(EXPECTED_AFTER_PAYOUT.netProfit);
    expect(b.target).toBe(EXPECTED_AFTER_PAYOUT.target);
    expect(b.holdings).toEqual(EXPECTED_AFTER_PAYOUT.holdings);
    expect(b.owes).toEqual(EXPECTED_AFTER_PAYOUT.owes);
    expect(b.pendingTotal).toBe(EXPECTED_AFTER_PAYOUT.pendingTotal);
    expect(b.pendingByPlatform.shopee.settled_not_withdrawn).toBe(801);
    expect(b.pendingByPlatform.tiktok.total).toBe(0);
  });

  it("matches the hand calculation before the payout is reconciled", () => {
    const b = computeBalance(toBalanceTx(false), [SEED_TRANSFER]);
    expect(b.settledIncome).toBe(EXPECTED_BEFORE_PAYOUT.settledIncome);
    expect(b.netProfit).toBe(EXPECTED_BEFORE_PAYOUT.netProfit);
    expect(b.holdings).toEqual(EXPECTED_BEFORE_PAYOUT.holdings);
    expect(b.owes).toEqual(EXPECTED_BEFORE_PAYOUT.owes);
    expect(b.pendingTotal).toBe(EXPECTED_BEFORE_PAYOUT.pendingTotal);
    expect(b.pendingByPlatform.tiktok.pending).toBe(783);
    expect(b.pendingByPlatform.tiktok.orders).toBe(2);
  });

  it("holdings always sum to net profit", () => {
    for (const after of [true, false]) {
      const b = computeBalance(toBalanceTx(after), [SEED_TRANSFER]);
      expect(b.holdings.mike + b.holdings.sai).toBeCloseTo(b.netProfit, 2);
      expect(b.delta.mike).toBeCloseTo(-b.delta.sai, 2);
    }
  });

  it("reports Balanced when the absolute delta is under one baht", () => {
    const b = computeBalance(
      [
        { type: "income", platform: "fb", net_amount: 100.4, payer: null, received_by: "mike", settlement_status: "received_in_bank" },
        { type: "income", platform: "fb", net_amount: 100, payer: null, received_by: "sai", settlement_status: "received_in_bank" },
      ],
      [],
    );
    expect(b.owes).toBeNull();
  });

  it("ignores income that is not yet received in bank", () => {
    const b = computeBalance(
      [
        { type: "income", platform: "tiktok", net_amount: 1000, payer: null, received_by: "mike", settlement_status: "pending" },
        { type: "income", platform: "tiktok", net_amount: 500, payer: null, received_by: "mike", settlement_status: "settled_not_withdrawn" },
      ],
      [],
    );
    expect(b.settledIncome).toBe(0);
    expect(b.holdings.mike).toBe(0);
    expect(b.pendingByPlatform.tiktok.pending).toBe(1000);
    expect(b.pendingByPlatform.tiktok.settled_not_withdrawn).toBe(500);
  });
});
