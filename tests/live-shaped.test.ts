import { describe, expect, it } from "vitest";
import { buildAccrualPL, buildBalanceSheet, checkBooks } from "@/lib/accounting/statements";
import { computeBalance } from "@/lib/balance";
import { BOX_1KG, BOX_500G, LIVE_TODAY, liveLedger } from "@/lib/fixtures/live-shaped";
import { buildInvestment } from "@/lib/investment";
import { valueStock } from "@/lib/inventory/valuation";
import { allocatePayout, payoutReminderDue } from "@/lib/payouts/partial";
import { buildReports } from "@/lib/reports/build";

const sept = { key: "custom" as const, from: "2026-09-01", to: "2026-09-30" };

describe("live-shaped ledger: bought 32, sold 20, samples 3", () => {
  const input = liveLedger();
  const valuation = valueStock(input.products, input.movements);
  const bundle = buildReports({ ...input, settings: [{ platform: "tiktok", commission_pct: 8 }] }, sept, `${LIVE_TODAY}T00:00:00Z`);

  it("on hand 12 worth 3,120; COGS 5,200", () => {
    const b1 = valuation.products.find((r) => r.product.id === BOX_1KG)!;
    const b2 = valuation.products.find((r) => r.product.id === BOX_500G)!;
    expect(b1.onHand).toBe(0);
    expect(b2.onHand).toBe(12);
    expect(valuation.totalValue).toBe(3120);
    expect(valuation.totalBacklogValue).toBe(0);
    expect(buildAccrualPL(input, sept).cogs).toBe(5200);
  });

  it("samples are 890 in the Samples card and in the operating expense, to the satang", () => {
    const pl = bundle.accrual;
    const samplesLine = pl.operating.find((o) => o.category.name_en === "Samples")!;
    expect(samplesLine.amount).toBe(890);
    expect(bundle.inventory!.samplesTotal).toBe(890);
    expect(bundle.inventory!.samples.reduce((a, r) => a + r.cost, 0)).toBeCloseTo(890, 2);
    expect(bundle.inventory!.samples.map((r) => r.qty)).toEqual([1, 1, 1]);
    expect(bundle.inventory!.samples.every((r) => r.product.name.startsWith("Sample sugar"))).toBe(true);
  });

  it("invested 9,210: Mike 2,005, Sai 7,205, Mike owes Sai 2,600", () => {
    const inv = buildInvestment(input, LIVE_TODAY);
    expect(inv.total).toBe(9210);
    expect(inv.byPerson).toEqual({ mike: 2005, sai: 7205 });
    expect(inv.fairShare).toBe(4605);
    expect(inv.settle).toEqual({ from: "mike", to: "sai", amount: 2600 });
    expect(inv.contributions[0].date).toBe("2026-09-17");
    expect(inv.contributions.find((c) => c.kind === "capital")).toMatchObject({ who: "mike", amount: 2005, running: 2005 });
    expect(inv.returns.pending).toBe(20 * 377);
    expect(inv.returns.cashReceived).toBe(0);
  });

  it("books balance and the planned margin uses the honest expectation", () => {
    expect(checkBooks(input, LIVE_TODAY).ok).toBe(true);
    const sheet = buildBalanceSheet(input, LIVE_TODAY);
    expect(sheet.inventory).toBe(3120);
    const plan = bundle.inventory!.marginPlan.find((r) => r.product.id === BOX_1KG)!;
    expect(plan.expectedNetPerUnit).toBe(311);
    expect(plan.expectedMargin).toBe((311 - 260) * 20);
    expect(plan.realizedNetPerUnit).toBe(377);
    const noExpectation = bundle.inventory!.marginPlan.find((r) => r.product.id === BOX_500G);
    expect(noExpectation).toBeUndefined();
  });

  it("received and put in replace holdings in plain language", () => {
    const b = computeBalance(
      input.transactions.map((t) => ({ type: t.type, platform: t.platform, net_amount: t.net_amount, payer: t.payer, received_by: t.received_by, settlement_status: t.settlement?.status ?? null, paid_amount: t.settlement?.paid_amount ?? 0 })),
      input.transfers,
    );
    expect(b.putIn).toEqual({ mike: 2005, sai: 9210 });
    expect(b.received).toEqual({ mike: 0, sai: 2005 });
    expect(b.holdings).toEqual({ mike: -2005, sai: -7205 });
  });
});

describe("partial payouts (70/30)", () => {
  it("a 70% payout covers the oldest orders in full and leaves the rest pending", () => {
    const sel = [
      { settlement_id: "a", net_amount: 377 },
      { settlement_id: "b", net_amount: 377 },
      { settlement_id: "c", net_amount: 754 },
    ];
    expect(allocatePayout(sel, 1055.6)).toEqual([
      { settlement_id: "a", paid: 377, full: true },
      { settlement_id: "b", paid: 377, full: true },
      { settlement_id: "c", paid: 301.6, full: false },
    ]);
    expect(allocatePayout(sel, 1508)).toEqual(sel.map((s) => ({ settlement_id: s.settlement_id, paid: s.net_amount, full: true })));
  });

  it("the paid part counts as received, the rest stays pending", () => {
    const b = computeBalance([{ type: "income", platform: "tiktok", net_amount: 754, payer: null, received_by: "sai", settlement_status: "pending", paid_amount: 301.6 }], []);
    expect(b.received.sai).toBe(301.6);
    expect(b.pendingTotal).toBe(452.4);
  });

  it("reminder fires after 18:00 Bangkok when money is pending and no payout is dated today", () => {
    const at = (iso: string) => new Date(iso);
    expect(payoutReminderDue(at("2026-09-17T11:30:00Z"), 1000, [])).toBe(true); // 18:30 Bangkok
    expect(payoutReminderDue(at("2026-09-17T10:30:00Z"), 1000, [])).toBe(false); // 17:30 Bangkok
    expect(payoutReminderDue(at("2026-09-17T11:30:00Z"), 1000, ["2026-09-17"])).toBe(false);
    expect(payoutReminderDue(at("2026-09-17T11:30:00Z"), 0, [])).toBe(false);
  });
});
