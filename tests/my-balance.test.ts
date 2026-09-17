import { describe, expect, it } from "vitest";
import { REPORT_TODAY, seedLedger } from "@/lib/fixtures/report-data";
import { arrivalsFor, buildMyBalance, exposureLevel, type BalanceTransferInput, type MyBalanceInput } from "@/lib/my-balance";
import type { ReportTx } from "@/lib/reports/build";

/**
 * Seed ledger after the TikTok payout, plus:
 *   - Mike puts in 1,000 of his own money as capital (does not change profit, moves holdings)
 *   - one more Shopee sale of 500 net on 14 Sep, still waiting, with Shopee early payout at 70%
 * Hand calculation (see README "How the balance is computed"):
 *   received in bank 1983, expenses 840, profit 1143, target 571.50
 *   Mike holds 743 (before capital) - 1000 capital sent = -257 ; Sai holds 400 + 1000 = 1400
 *   Mike delta = -257 - 571.50 = -828.50  -> Sai owes Mike 828.50
 *   waiting: Shopee 801 (settled, in wallet) + 500 (pending) = 1301 ; half = 650.50
 *   Mike exposure = 828.50 + 650.50 = 1479.00 ; limit 3000 -> 49.3%, ok
 */
function fixture(): MyBalanceInput {
  const base = seedLedger();
  const capital: BalanceTransferInput = { id: "cap1", date: "2026-09-06", from_person: "mike", to_person: "sai", amount: 1000, note: "Stock purchase", kind: "capital", reason: "for_stock" };
  const extra: ReportTx = {
    id: "sp2",
    type: "income",
    date: "2026-09-14",
    platform: "shopee",
    product_line: "skincare",
    gross_amount: 550,
    net_amount: 500,
    quantity: 1,
    payer: null,
    received_by: "sai",
    category_id: null,
    customer_name: "Fon",
    note: "",
    created_at: "2026-09-14T09:00:00Z",
    settlement: { status: "pending", settled_at: null, payout_id: null },
  };
  return {
    transactions: [...base.transactions, extra],
    transfers: [...base.transfers.map((t) => ({ ...t, kind: "settlement" as const, reason: "profit_share" as const })), capital],
    settings: [
      { platform: "tiktok", settlement_lag_days: 9, daily_payout_pct: 100 },
      { platform: "shopee", settlement_lag_days: 10, daily_payout_pct: 70 },
      { platform: "fb", settlement_lag_days: 0, daily_payout_pct: 100 },
      { platform: "other", settlement_lag_days: 10, daily_payout_pct: 100 },
    ],
    exposureLimit: 3000,
  };
}

describe("buildMyBalance for Mike", () => {
  const b = buildMyBalance(fixture(), "mike", REPORT_TODAY);

  it("(a) owed to me now comes from the shared balance formula", () => {
    expect(b.owedToMe).toBe(828.5);
    expect(b.iOwe).toBe(0);
  });

  it("(b) half of what is still with the platforms, grouped by platform, with arrival dates", () => {
    expect(b.incoming).toHaveLength(1);
    const shopee = b.incoming[0];
    expect(shopee.platform).toBe("shopee");
    expect(shopee.orders).toBe(2);
    expect(shopee.total).toBe(1301);
    expect(shopee.myShare).toBe(650.5);
    // 801 settled 3 Sep: 70% early on 3 Sep, 30% on 13 Sep. 500 pending 14 Sep: 350 on 14 Sep, 150 on 24 Sep.
    expect(shopee.arrivals).toEqual([
      { date: "2026-09-03", amount: 560.7, early: true },
      { date: "2026-09-13", amount: 240.3, early: false },
      { date: "2026-09-14", amount: 350, early: true },
      { date: "2026-09-24", amount: 150, early: false },
    ]);
    expect(shopee.nextArrival).toBe("2026-09-24");
    expect(shopee.overdue).toBe(1151);
    expect(b.incomingTotal).toBe(650.5);
  });

  it("(c) exposure is (a) + (b) against the limit", () => {
    expect(b.exposure).toBe(1479);
    expect(b.exposurePct).toBe(49.3);
    expect(b.level).toBe("ok");
  });

  it("(d) today's action names who sends what", () => {
    expect(b.action).toEqual({ from: "sai", to: "mike", amount: 828.5 });
  });

  it("(e) lists only my capital transfers", () => {
    expect(b.capital.map((t) => t.id)).toEqual(["cap1"]);
    expect(b.capitalTotal).toBe(1000);
  });

  it("(f) produces a 30-day series ending today at the current exposure", () => {
    expect(b.series).toHaveLength(30);
    expect(b.series[29]).toEqual({ date: REPORT_TODAY, value: 1479 });
    // Before any sale, nothing was exposed.
    expect(b.series[0].value).toBe(0);
  });
});

describe("buildMyBalance for Sai is the mirror", () => {
  const b = buildMyBalance(fixture(), "sai", REPORT_TODAY);
  it("shows what Sai owes and the same incoming half", () => {
    expect(b.owedToMe).toBe(0);
    expect(b.iOwe).toBe(828.5);
    expect(b.incomingTotal).toBe(650.5);
    expect(b.exposure).toBe(650.5);
    expect(b.action).toEqual({ from: "sai", to: "mike", amount: 828.5 });
    expect(b.capital).toEqual([]);
  });
});

describe("arrivals and exposure levels", () => {
  it("pays everything after the lag when early payout is off", () => {
    const tx = fixture().transactions.find((t) => t.id === "sp2")!;
    expect(arrivalsFor(tx, { platform: "shopee", settlement_lag_days: 10, daily_payout_pct: 100 })).toEqual([{ date: "2026-09-24", amount: 500, early: false }]);
  });

  it("colours by share of the limit", () => {
    expect(exposureLevel(2399, 3000)).toBe("ok");
    expect(exposureLevel(2400, 3000)).toBe("amber");
    expect(exposureLevel(3000, 3000)).toBe("amber");
    expect(exposureLevel(3000.01, 3000)).toBe("red");
  });
});
