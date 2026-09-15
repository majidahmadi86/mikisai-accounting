import { describe, expect, it } from "vitest";
import { REPORT_TODAY, seedLedger } from "@/lib/fixtures/report-data";
import { buildReports } from "@/lib/reports/build";
import { checkpoints, resolvePeriod, thisMonth, thisWeek } from "@/lib/reports/period";

const month = { key: "custom" as const, from: "2026-09-01", to: "2026-09-30" };

describe("period", () => {
  it("resolves this week Monday to Sunday and this month first to last", () => {
    expect(thisWeek("2026-09-16")).toEqual({ key: "week", from: "2026-09-14", to: "2026-09-20" });
    expect(thisMonth("2026-09-16")).toEqual({ key: "month", from: "2026-09-01", to: "2026-09-30" });
    expect(thisMonth("2026-02-10")).toEqual({ key: "month", from: "2026-02-01", to: "2026-02-28" });
  });

  it("falls back to this month on bad custom input", () => {
    expect(resolvePeriod({ period: "custom", from: "nope", to: "2026-09-10" }, "2026-09-16").key).toBe("month");
    expect(resolvePeriod({ period: "custom", from: "2026-09-10", to: "2026-09-01" }, "2026-09-16").key).toBe("month");
    expect(resolvePeriod({ period: "custom", from: "2026-08-01", to: "2026-08-31" }, "2026-09-16")).toEqual({ key: "custom", from: "2026-08-01", to: "2026-08-31" });
  });

  it("lists month ends inside the period plus the period end", () => {
    expect(checkpoints({ key: "custom", from: "2026-07-15", to: "2026-09-16" })).toEqual(["2026-07-31", "2026-08-31", "2026-09-16"]);
    expect(checkpoints(month)).toEqual(["2026-09-30"]);
  });
});

describe("buildReports on the seed ledger", () => {
  const bundle = buildReports(seedLedger(), month, `${REPORT_TODAY}T00:00:00Z`);

  it("profit and loss: 4 orders, gross 2960, net 2784, expenses 840, profit 1944", () => {
    expect(bundle.pl.orders).toBe(4);
    expect(bundle.pl.units).toBe(5);
    expect(bundle.pl.gross).toBe(2960);
    expect(bundle.pl.net).toBe(2784);
    expect(bundle.pl.fees).toBe(176);
    expect(bundle.pl.totalExpenses).toBe(840);
    expect(bundle.pl.profit).toBe(1944);
    expect(bundle.pl.byStatus).toEqual({ pending: 0, settled_not_withdrawn: 801, received_in_bank: 1983 });
  });

  it("sales by product: skincare 2001 net ahead of sugar 783", () => {
    expect(bundle.byProduct.map((r) => [r.product, r.orders, r.units, r.net, r.expenses, r.profit, r.netPerUnit])).toEqual([
      ["skincare", 2, 2, 2001, 600, 1401, 1000.5],
      ["sugar", 2, 3, 783, 240, 543, 261],
    ]);
  });

  it("sales by platform with fee percentage", () => {
    expect(bundle.byPlatform.map((r) => [r.platform, r.orders, r.gross, r.net, r.fees, r.feePct])).toEqual([
      ["fb", 1, 1200, 1200, 0, 0],
      ["shopee", 1, 890, 801, 89, 10],
      ["tiktok", 2, 870, 783, 87, 10],
    ]);
  });

  it("expenses by category with share of total", () => {
    expect(bundle.byCategory.map((r) => [r.category, r.count, r.amount, r.share])).toEqual([
      ["ads", 1, 600, 71.43],
      ["packaging", 1, 240, 28.57],
    ]);
  });

  it("settlement status per platform", () => {
    const shopee = bundle.settlement.find((r) => r.platform === "shopee")!;
    expect(shopee.walletOrders).toBe(1);
    expect(shopee.wallet).toBe(801);
    const tiktok = bundle.settlement.find((r) => r.platform === "tiktok")!;
    expect(tiktok.bankOrders).toBe(2);
    expect(tiktok.bank).toBe(783);
  });

  it("who-owes-whom at month end matches the hand calculation (Mike owes Sai 171.50)", () => {
    expect(bundle.owesHistory).toHaveLength(1);
    const row = bundle.owesHistory[0];
    expect(row.asOf).toBe("2026-09-30");
    expect(row.mikeHolds).toBe(743);
    expect(row.saiHolds).toBe(400);
    expect(row.owes).toEqual({ from: "mike", to: "sai", amount: 171.5 });
  });

  it("before the payout date the TikTok orders are still waiting, so Sai owes Mike 220", () => {
    const early = buildReports(seedLedger(), { key: "custom", from: "2026-09-01", to: "2026-09-09" });
    expect(early.owesHistory[0].owes).toEqual({ from: "sai", to: "mike", amount: 220 });
  });

  it("customer list sorted by what you received", () => {
    expect(bundle.customers.map((c) => [c.name, c.orders, c.net])).toEqual([
      ["Aom", 1, 1200],
      ["Bee", 1, 801],
      ["Khun Ploy", 1, 468],
      ["Nong Pim", 1, 315],
    ]);
  });

  it("filters by period", () => {
    const week = buildReports(seedLedger(), { key: "custom", from: "2026-09-01", to: "2026-09-02" });
    expect(week.pl.orders).toBe(2);
    expect(week.pl.net).toBe(783);
    expect(week.pl.totalExpenses).toBe(240);
  });
});
