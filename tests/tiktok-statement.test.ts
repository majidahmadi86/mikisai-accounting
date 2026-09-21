import { describe, expect, it } from "vitest";
import { readXlsxSheets } from "@/lib/import/table";
import { boxesFromRevenue, isStatementHeader, parseItems, readStatement, unitsOf, type SkuEntry } from "@/lib/tiktok/statement";
import { planIsEmpty, planStatement, type LedgerOrder, type StatementPlanInput } from "@/lib/tiktok/statement-plan";
import { walletState } from "@/lib/tiktok/wallet";
import { IDS, ORDER_HEADERS, SKU_1, SKU_2, SKU_3, STATEMENT_GRIDS, statementXlsx } from "./fixtures/tiktok/finance-statement";

const BOX = "00000000-0000-4000-8000-0000000000b1";
const skus = new Map<string, SkuEntry>([
  [`id:${SKU_1}`, { product_id: BOX, multiplier: 1 }],
  [`id:${SKU_2}`, { product_id: BOX, multiplier: 2 }],
  [`id:${SKU_3}`, { product_id: BOX, multiplier: 3 }],
]);

const statement = () => readStatement(STATEMENT_GRIDS)!;
const input = (over: Partial<StatementPlanInput> = {}): StatementPlanInput => ({ statement: statement(), startDate: "2026-09-15", receivedBy: "sai", skus, fallbackProductId: BOX, ledger: new Map(), knownFacts: new Set(), history: { settled: [], losses: [], events: [] }, knownPayouts: new Set(), unsettled: [], ...over });

describe("reading the Finance statement", () => {
  it("recognises the Order details header and nothing else", () => {
    expect(isStatementHeader(ORDER_HEADERS)).toBe(true);
    expect(isStatementHeader(["Order ID", "Order Status", "Quantity"])).toBe(false);
  });

  it("reads the real .xlsx: three sheets, string numbers, yyyy/mm/dd dates, the period from Reports", async () => {
    const s = readStatement(await readXlsxSheets(await statementXlsx()))!;
    expect(s.period).toEqual({ from: "2026-09-10", to: "2026-09-20" });
    expect(s.rows).toHaveLength(8);
    expect(s.wallet.map((w) => w.kind)).toEqual(["mirror", "earnings", "earnings", "withdrawal", "earnings", "mirror"]);
    const plain = s.rows.find((r) => r.id === IDS.plain)!;
    expect(plain).toMatchObject({ type: "order", created: "2026-09-15", settled: "2026-09-18", settlement: 308.46, revenue: 399, fee_commission: -19.95, fee_commerce_growth: -13.02, fee_transaction: -12.57, fee_seller_shipping: -45, chargeable_weight_g: 10000 });
    expect(s.rows.find((r) => r.id === IDS.refund)!.type).toBe("refund");
    expect(s.rows.find((r) => r.id === IDS.disbursement)!).toMatchObject({ type: "advance_disbursement", adjustment: 500 });
    expect(s.rows.find((r) => r.id === IDS.recovery)!).toMatchObject({ type: "advance_recovery", adjustment: -200 });
    expect(s.wallet.find((w) => w.kind === "withdrawal")).toMatchObject({ amount: -1390.92, success: "2026-09-18", bank: "KASIKORNBANK ****1234" });
  });

  it("reads item details, the listing multiplier, and infers boxes from revenue when details are a slash", () => {
    expect(parseItems(`${SKU_1} * 1; ${SKU_2} * 2;`)).toEqual([{ sku_id: SKU_1, qty: 1 }, { sku_id: SKU_2, qty: 2 }]);
    expect(parseItems("/")).toEqual([]);
    expect(unitsOf({ items: [{ sku_id: SKU_2, qty: 1 }], revenue: 798 }, skus, BOX)).toMatchObject({ boxes: 2, inferred: false, product_id: BOX });
    expect(unitsOf({ items: [{ sku_id: SKU_3, qty: 2 }], revenue: 2394 }, skus, BOX).boxes).toBe(6);
    expect(unitsOf({ items: [], revenue: 1197 }, skus, BOX)).toMatchObject({ boxes: 3, inferred: true });
    expect([399, 759, 798, 1099, 1197, 500].map(boxesFromRevenue)).toEqual([1, 2, 2, 3, 3, null]);
    expect(unitsOf({ items: [{ sku_id: "1999", qty: 1 }], revenue: 399 }, skus, BOX)).toMatchObject({ boxes: null, unknown_skus: ["1999"] });
  });
});

describe("what the statement does", () => {
  it("creates missing orders at what TikTok really paid: 399 nets 308.46, the overweight parcel 272.46", () => {
    const p = planStatement(input());
    const byRef = new Map(p.create.map((c) => [c.order_ref, c]));
    expect(byRef.get(IDS.plain)).toMatchObject({ net_amount: 308.46, gross_amount: 399, quantity: 1, date: "2026-09-15", product_id: BOX, qty_inferred: false });
    expect(byRef.get(IDS.heavy)).toMatchObject({ net_amount: 272.46, quantity: 1 });
    expect(byRef.get(IDS.bundle)).toMatchObject({ quantity: 2, net_amount: 640 });
    expect(byRef.get(IDS.noDetails)).toMatchObject({ quantity: 3, qty_inferred: true });
    expect(p.overweight.map((o) => o.order_ref)).toEqual([IDS.heavy]);
    expect(p.facts.find((f) => f.order_ref === IDS.heavy)).toMatchObject({ overweight: true, fee_seller_shipping: -81, chargeable_weight_g: 12500 });
  });

  it("settles an order already in the ledger and corrects a net that is more than one baht off", () => {
    const ledger = new Map<string, LedgerOrder>([
      [IDS.plain, { id: "t1", order_ref: IDS.plain, date: "2026-09-15", net_amount: 310.82, status: "active", settlement_status: "pending" }],
      [IDS.heavy, { id: "t2", order_ref: IDS.heavy, date: "2026-09-16", net_amount: 272.9, status: "active", settlement_status: "pending" }],
    ]);
    const p = planStatement(input({ ledger }));
    expect(p.create.map((c) => c.order_ref)).not.toContain(IDS.plain);
    expect(p.settle.find((s) => s.order_ref === IDS.plain)).toMatchObject({ transaction_id: "t1", net: 308.46, settled_date: "2026-09-18", from_pending: true });
    expect(p.netFixes).toEqual([{ transaction_id: "t1", order_ref: IDS.plain, old: 310.82, new: 308.46 }]);
    expect(p.facts.find((f) => f.order_ref === IDS.plain)!.ledger_net_before).toBe(310.82);
  });

  it("turns a refund into a Return cost, never a sale", () => {
    const p = planStatement(input());
    expect(p.refunds).toEqual([{ transaction_id: null, order_ref: IDS.refund, date: "2026-09-19", loss: 45 }]);
    expect(p.create.map((c) => c.order_ref)).not.toContain(IDS.refund);
    expect(p.facts.find((f) => f.kind === "refund")).toMatchObject({ order_ref: IDS.refund, settlement_amount: -45 });
  });

  it("keeps orders from before 15 Sept outside the business", () => {
    const p = planStatement(input());
    expect(p.preBusiness).toEqual({ count: 1, total: 310 });
    expect(p.facts.find((f) => f.order_ref === IDS.pre)).toMatchObject({ pre_business: true, transaction_id: null });
    expect(p.create.map((c) => c.order_ref)).not.toContain(IDS.pre);
    expect(p.settle.map((c) => c.order_ref)).not.toContain(IDS.pre);
    // Its money was in the withdrawal, but it pays no business order and is no business cash.
    const w = p.wallet.withdrawals[0];
    expect(w.orders.map((o) => o.order_ref)).toEqual([IDS.plain, IDS.heavy]);
    expect(w.other).toBe(310);
    const later = planStatement(input({ startDate: "2026-09-01" }));
    expect(later.preBusiness.count).toBe(0);
  });

  it("the advance balance equals disbursements minus recoveries, and is cash but never an order", () => {
    const p = planStatement(input());
    expect(p.wallet.disbursed).toBe(500);
    expect(p.wallet.recovered).toBe(200);
    expect(p.wallet.advanceBalance).toBe(300);
    // The mirror rows on the wallet sheet did not count twice.
    expect(p.walletEvents.filter((e) => e.kind === "advance_disbursement")).toHaveLength(1);
    expect(p.walletEvents.filter((e) => e.kind === "advance_recovery")).toHaveLength(1);
    // 500 reached the bank with the withdrawal; 200 of it was taken back out of later settlements.
    expect(p.wallet.advanceCash.map((c) => c.amount)).toEqual([500, -200]);
    expect(p.wallet.withdrawals[0]).toMatchObject({ reference: IDS.withdrawal, amount: 1390.92, advance: 500, bank_suffix: "1234", date: "2026-09-18" });
    expect(p.wallet.earningsMismatch).toEqual([]);
  });

  it("spreads the advance over unsettled business orders at 70% each, oldest first; the rest is from before the business", () => {
    const p = planStatement(input({ unsettled: [{ order_ref: "u2", date: "2026-09-20", value: 310 }, { order_ref: "u1", date: "2026-09-19", value: 300 }] }));
    expect(p.wallet.allocations).toEqual([{ order_ref: "u1", date: "2026-09-19", amount: 210 }, { order_ref: "u2", date: "2026-09-20", amount: 90 }]);
    expect(p.wallet.advancePreBusiness).toBe(0);
    expect(planStatement(input()).wallet.advancePreBusiness).toBe(300);
  });

  it("dropping the same file twice changes nothing", () => {
    const first = planStatement(input());
    const knownFacts = new Set(first.facts.map((f) => `${f.order_ref}:${f.kind}`));
    const history = {
      settled: first.facts.filter((f) => f.kind === "order" && f.settled_date).map((f) => ({ order_ref: f.order_ref, date: f.settled_date as string, net: f.settlement_amount, business: !f.pre_business })),
      losses: first.refunds.map((r) => ({ order_ref: r.order_ref, date: r.date, loss: r.loss })),
      events: first.walletEvents,
    };
    const ledger = new Map<string, LedgerOrder>(first.create.map((c, i) => [c.order_ref, { id: `t${i}`, order_ref: c.order_ref, date: c.date, net_amount: c.net_amount, status: "active", settlement_status: "settled_not_withdrawn" }]));
    const second = planStatement(input({ knownFacts, history, ledger, knownPayouts: new Set(first.payouts.map((w) => w.reference)) }));
    expect(planIsEmpty(second)).toBe(true);
    expect(second.alreadyKnown).toBe(first.facts.length + first.walletEvents.length);
    expect(second.wallet.advanceBalance).toBe(300);
  });
});

describe("wallet replay", () => {
  it("pays the oldest settled orders first, up to what was withdrawn", () => {
    const w = walletState({ settled: [{ order_ref: "a", date: "2026-09-16", net: 300, business: true }, { order_ref: "b", date: "2026-09-17", net: 300, business: true }, { order_ref: "c", date: "2026-09-18", net: 300, business: true }], losses: [], events: [{ kind: "withdrawal", reference: "w", date: "2026-09-18", amount: -600 }], unsettled: [] });
    expect(w.withdrawals[0].orders.map((o) => o.order_ref)).toEqual(["a", "b"]);
    expect(w.withdrawals[0]).toMatchObject({ advance: 0, other: 0 });
  });

  it("an advance still in the wallet when it is recovered never touches the bank", () => {
    const w = walletState({ settled: [{ order_ref: "a", date: "2026-09-17", net: 300, business: true }], losses: [], events: [{ kind: "advance_disbursement", reference: "d", date: "2026-09-16", amount: 200 }, { kind: "advance_recovery", reference: "r", date: "2026-09-17", amount: -200 }, { kind: "withdrawal", reference: "w", date: "2026-09-18", amount: -300 }], unsettled: [] });
    expect(w.advanceBalance).toBe(0);
    expect(w.advanceCash).toEqual([]);
    expect(w.withdrawals[0]).toMatchObject({ advance: 0, other: 0 });
    expect(w.withdrawals[0].orders).toEqual([{ order_ref: "a", amount: 300 }]);
  });
});
