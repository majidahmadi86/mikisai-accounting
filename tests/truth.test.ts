import { describe, expect, it } from "vitest";
import { buildBalanceSheet } from "@/lib/accounting/statements";
import { LIVE_TODAY, liveLedger } from "@/lib/fixtures/live-shaped";
import { REPORT_TODAY, seedLedger } from "@/lib/fixtures/report-data";
import { buildInvestment } from "@/lib/investment";
import { buildStockPage } from "@/lib/inventory/stock-page";
import { buildUnitsReport } from "@/lib/inventory/units";
import { buildMyBalance } from "@/lib/my-balance";
import { buildReports } from "@/lib/reports/build";
import { contributions, inventoryValue, stockPositions, whoOwesWhom, type TruthInput } from "@/lib/truth";

const seed = (): TruthInput => {
  const s = seedLedger();
  return { ...s, products: [], movements: [], items: [], transfers: s.transfers.map((t) => ({ ...t, kind: "settlement" as const, reason: "profit_share" as const })) };
};
const live = (): TruthInput => ({ ...liveLedger(), items: liveLedger().items ?? [] });

function owesEverywhere(input: TruthInput, today: string) {
  const truth = whoOwesWhom(input, today);
  const home = truth.owes;
  const balanceMike = buildMyBalance({ transactions: input.transactions, transfers: input.transfers, settings: [], exposureLimit: 3000 }, "mike", today);
  const myBalance = balanceMike.owedToMe > 0 ? { from: "sai", to: "mike", amount: balanceMike.owedToMe } : balanceMike.iOwe > 0 ? { from: "mike", to: "sai", amount: balanceMike.iOwe } : null;
  const investment = buildInvestment(input, today).settle;
  const report = buildReports(input, { key: "custom", from: `${today.slice(0, 7)}-01`, to: today }).owesHistory.at(-1)!.owes;
  const sheet = buildBalanceSheet(input, today).partnerBalance;
  const sheetOwes = Math.abs(sheet.mike) >= 1 ? (sheet.mike > 0 ? { from: "mike", to: "sai", amount: sheet.mike } : { from: "sai", to: "mike", amount: sheet.sai }) : null;
  return { home, myBalance, investment, report, sheetOwes };
}

describe("one truth: who owes whom", () => {
  it("Home banner === My Balance === Investment to-be-equal === Who owes whom === Balance sheet, seed fixture", () => {
    const o = owesEverywhere(seed(), REPORT_TODAY);
    expect(o.home).toEqual({ from: "mike", to: "sai", amount: 171.5 });
    expect(o.myBalance).toEqual(o.home);
    expect(o.investment).toEqual(o.home);
    expect(o.report).toEqual(o.home);
    expect(o.sheetOwes).toEqual(o.home);
  });

  it("the same five agree on the live-shaped fixture, and transfers count whatever their reason", () => {
    const input = live();
    const o = owesEverywhere(input, LIVE_TODAY);
    // Sai paid 9,210 and received 2,005 from Mike; nothing is in the bank yet. Cash result -9,210, half each -4,605.
    // Mike: -2,005 - (-4,605) = +2,600 -> Mike holds more than his share of the loss: Mike owes Sai 2,600.
    expect(o.home).toEqual({ from: "mike", to: "sai", amount: 2600 });
    expect(o.myBalance).toEqual(o.home);
    expect(o.investment).toEqual(o.home);
    expect(o.report).toEqual(o.home);
    expect(o.sheetOwes).toEqual(o.home);
    const asShare: TruthInput = { ...input, transfers: input.transfers.map((t) => ({ ...t, reason: "profit_share" as const, kind: "settlement" as const })) };
    expect(whoOwesWhom(asShare, LIVE_TODAY).owes).toEqual(o.home);
  });

  it("contributions are display only: expenses paid plus transfers sent for anything but a profit share", () => {
    const input = live();
    expect(contributions(input, "mike", LIVE_TODAY).total).toBe(2005);
    expect(contributions(input, "sai", LIVE_TODAY).total).toBe(9210);
    const asShare: TruthInput = { ...input, transfers: input.transfers.map((t) => ({ ...t, reason: "profit_share" as const })) };
    expect(contributions(asShare, "mike", LIVE_TODAY).total).toBe(0);
    expect(whoOwesWhom(asShare, LIVE_TODAY).owes).toEqual(whoOwesWhom(input, LIVE_TODAY).owes);
  });

  it("Home partner cards: received from platforms, received from partner, put in, fair share of costs", () => {
    const w = whoOwesWhom(live(), LIVE_TODAY);
    expect(w.fromPlatforms).toEqual({ mike: 0, sai: 0 });
    expect(w.fromPartner).toEqual({ mike: 0, sai: 2005 });
    expect(w.putIn).toEqual({ mike: 2005, sai: 9210 });
    expect(w.fairShareOfCosts).toBe(4605);
  });
});

describe("one truth: stock", () => {
  it("Stock page === Home strip === Units report === Balance sheet inventory === Product detail, live-shaped fixture", () => {
    const input = live();
    const positions = stockPositions(input);
    const page = buildStockPage({ products: input.products, movements: input.movements, items: input.items, names: new Map() });
    for (const card of page.cards) {
      const p = positions.find((x) => x.product.id === card.stock.product.id)!;
      expect([card.bought, card.sold, card.samples, card.stock.onHand, card.stock.backlog, card.stock.value]).toEqual([p.bought, p.sold, p.samples, p.onHand, p.backlog, p.value]);
    }
    const units = buildUnitsReport({ products: input.products, movements: input.movements, items: input.items, sales: input.transactions.filter((t) => t.type === "income").map((t) => ({ id: t.id, date: t.date })) }, { key: "custom", from: "2026-09-01", to: LIVE_TODAY }, "month");
    for (const total of units.totals) {
      const p = positions.find((x) => x.product.id === total.product.id)!;
      expect([total.unitsSold, total.unitsBought, total.samplesOut, total.onHandEnd, total.backlogEnd]).toEqual([p.sold, p.bought, p.samples, p.onHand, p.backlog]);
    }
    expect(buildBalanceSheet(input, LIVE_TODAY).inventory).toBe(inventoryValue(input, LIVE_TODAY));
    expect(inventoryValue(input)).toBe(3120);
  });
});
