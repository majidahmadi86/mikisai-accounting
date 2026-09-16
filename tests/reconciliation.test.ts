import { describe, expect, it } from "vitest";
import { buildAccrualPL, buildBalanceSheet, buildCashFlow, checkBooks, reconcileProfit } from "@/lib/accounting/statements";
import { REAL_TODAY, realLedger, UNIT_NET } from "@/lib/fixtures/real-sept";
import { REPORT_TODAY, seedLedger } from "@/lib/fixtures/report-data";
import { valueStock } from "@/lib/inventory/valuation";

const sept = { key: "custom" as const, from: "2026-09-01", to: "2026-09-30" };

describe("real September data: 9 orders (5 x 1, 4 x 2), samples 890, purchase of 12", () => {
  const input = realLedger();
  const valuation = valueStock(input.products, input.movements);
  const pl = buildAccrualPL(input, sept);
  const cash = buildCashFlow(input, sept);
  const sheet = buildBalanceSheet(input, REAL_TODAY);

  it("13 units sold, backlog of 1 after the purchase of 12", () => {
    const box = valuation.products.find((p) => p.product.id === input.products[0].id)!;
    expect((input.items ?? []).filter((i) => i.transaction_id.startsWith("o")).reduce((a, i) => a + i.qty, 0)).toBe(13);
    expect(box.onHand).toBe(-1);
    expect(box.backlog).toBe(1);
    expect(box.backlogValue).toBe(260);
    expect(box.value).toBe(0);
  });

  it("COGS is 13 x the average cost of 260", () => {
    expect(pl.cogs).toBe(13 * 260);
    expect(pl.revenue).toBe(13 * UNIT_NET);
  });

  it("stock purchases are not expenses; samples are, once", () => {
    expect(pl.operating.map((o) => [o.category.name_en, o.amount])).toEqual([["Samples", 890]]);
    expect(pl.samplesCost).toBeCloseTo(890.01, 2);
    expect(pl.stockPurchasesCash).toBe(3120);
    expect(pl.totalOperating).toBe(890);
    expect(pl.profit).toBe(13 * UNIT_NET - 13 * 260 - 890);
  });

  it("cash flow: nothing in the bank yet, 4,010 paid out", () => {
    expect(cash.cashIn).toBe(0);
    expect(cash.cashOut).toBe(4010);
    expect(cash.stockOut).toBe(3120);
    expect(cash.operatingOut).toBe(890);
    expect(cash.net).toBe(-4010);
    expect(cash.byPerson.mike.out).toBe(4010);
  });

  it("balance sheet balances: cash -4,010 + receivables 4,901 + stock 0 - backlog 260 = profit", () => {
    expect(sheet.cashTotal).toBe(-4010);
    expect(sheet.cash.mike).toBe(-4010);
    expect(sheet.receivables).toBe(13 * UNIT_NET);
    expect(sheet.inventory).toBe(0);
    expect(sheet.backlog).toBe(260);
    expect(sheet.equity).toBe(pl.profit);
    expect(sheet.balanced).toBe(true);
    expect(checkBooks(input, REAL_TODAY).ok).toBe(true);
  });

  it("reconciliation line: profit = in stock + pending + cash", () => {
    const r = reconcileProfit(input, sept);
    expect(r.profit).toBe(pl.profit);
    expect(r.inStock).toBe(-260);
    expect(r.pending).toBe(13 * UNIT_NET);
    expect(r.cash).toBe(-4010);
    expect(r.balanced).toBe(true);
  });
});

describe("seed fixture books balance too", () => {
  const seed = seedLedger();
  const input = { ...seed, products: [], movements: [], items: [] };
  it("with no stock tracked, equity equals cash profit", () => {
    const sheet = buildBalanceSheet(input, REPORT_TODAY);
    expect(sheet.balanced).toBe(true);
    expect(checkBooks(input, REPORT_TODAY).ok).toBe(true);
    expect(sheet.cashTotal).toBe(1143);
    expect(sheet.receivables).toBe(801);
    expect(sheet.equity).toBe(1944);
  });
});
