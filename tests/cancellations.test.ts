import { describe, expect, it } from "vitest";
import { buildAccrualPL, buildBalanceSheet, checkBooks } from "@/lib/accounting/statements";
import { BOX_1KG, LIVE_TODAY, liveLedger } from "@/lib/fixtures/live-shaped";
import { runHealthChecks } from "@/lib/health/checks";
import { buildUnitsReport } from "@/lib/inventory/units";
import { buildMyBalance } from "@/lib/my-balance";
import { summarisePayoutMatches } from "@/lib/payouts/flags";
import { buildReports, type ReportTx } from "@/lib/reports/build";
import { cancellations, clawbackPending, normalizeLedger, stockPositions, whoOwesWhom, type ClawbackLite, type TruthInput } from "@/lib/truth";

const sept = { key: "custom" as const, from: "2026-09-01", to: "2026-09-30" };

/** Live-shaped ledger where order o1 (1 box, 377 net) was paid out to Sai on 17 Sept and then cancelled on 18 Sept. */
function cancelledAfterPayout(): { input: TruthInput; raw: ReportTx[]; clawbacks: ClawbackLite[] } {
  const base = liveLedger();
  const raw: ReportTx[] = base.transactions.map((t) => (t.id === "o1" ? { ...t, settlement: { status: "received_in_bank", settled_at: "2026-09-17T10:00:00Z", payout_id: "p1", paid_amount: 377 }, status: "cancelled", status_date: "2026-09-18", refund_amount: 377 } : t));
  const clawbacks: ClawbackLite[] = [{ id: "cb1", transaction_id: "o1", amount: 377, status: "pending", payout_id: "p1", offset_payout_id: null, created_at: "2026-09-18T09:00:00Z" }];
  const movements = [...base.movements, { id: "ret-o1", product_id: BOX_1KG, qty: 1, kind: "return" as const, unit_cost: 260, transaction_id: "o1", date: "2026-09-18", created_at: "2026-09-18T09:00:00Z" }];
  const normalized = normalizeLedger(raw, clawbacks);
  const input: TruthInput = { ...base, items: base.items ?? [], movements, transactions: normalized.transactions, cancelled: normalized.cancelled, cashAdjustments: normalized.cashAdjustments, clawbacks, payouts: [{ id: "p1", date: "2026-09-17", platform: "tiktok", amount_received: 377, received_by: "sai", note: "" }] };
  return { input, raw, clawbacks };
}

describe("cancellations and refunds flow through truth.ts", () => {
  it("a cancelled order leaves revenue and the order count, and the paid-out cash is matched by its clawback", () => {
    const { input } = cancelledAfterPayout();
    expect(input.transactions.some((t) => t.id === "o1")).toBe(false);
    expect((input.cancelled ?? []).map((t) => t.id)).toEqual(["o1"]);
    // Cash: +377 received, -377 clawback; who owes whom is exactly the base figure (Mike owes Sai 2,600).
    expect(whoOwesWhom(input, "2026-09-18").owes).toEqual({ from: "mike", to: "sai", amount: 2600 });
    expect(whoOwesWhom(input, "2026-09-18").settledIncome).toBe(0);
    const pl = buildAccrualPL(input, sept);
    expect(pl.orders).toBe(13);
    expect(pl.revenue).toBe(19 * 377);
    expect(pl.cogs).toBe(19 * 260);
    expect(pl.cancelled).toEqual({ count: 1, cancelled: 1, refunded: 0, amount: 377, unitsReturned: 1 });
    expect(buildReports(input, sept).pl.cancelled).toEqual({ count: 1, amount: 377 });
  });

  it("the unit comes back to stock at its sale cost; Units report shows a return", () => {
    const { input } = cancelledAfterPayout();
    const pos = stockPositions(input).find((p) => p.product.id === BOX_1KG)!;
    expect([pos.bought, pos.sold, pos.returned, pos.onHand]).toEqual([20, 20, 1, 1]);
    const units = buildUnitsReport({ products: input.products, movements: input.movements, items: input.items, sales: input.transactions.filter((t) => t.type === "income").map((t) => ({ id: t.id, date: t.date })) }, sept, "month");
    const row = units.totals.find((r) => r.product.id === BOX_1KG)!;
    expect([row.unitsSold, row.unitsReturned, row.onHandEnd]).toEqual([20, 1, 1]);
    expect(checkBooks(input, "2026-09-18").ok).toBe(true);
    expect(buildBalanceSheet(input, "2026-09-18").inventory).toBe(13 * 260);
  });

  it("Clawback pending shows on Payouts and My Balance, and the payout keeps its match", () => {
    const { input } = cancelledAfterPayout();
    expect(clawbackPending(input)).toBe(377);
    expect(clawbackPending(input, "tiktok", [...input.transactions, ...(input.cancelled ?? [])])).toBe(377);
    expect(clawbackPending(input, "shopee", [...input.transactions, ...(input.cancelled ?? [])])).toBe(0);
    const mine = buildMyBalance({ transactions: input.transactions, transfers: input.transfers, settings: [], exposureLimit: 3000, cashAdjustments: input.cashAdjustments, clawbacks: input.clawbacks }, "sai", "2026-09-18");
    expect(mine.clawbackPending).toBe(377);
    expect(mine.owedToMe).toBe(2600);
    expect(summarisePayoutMatches([{ payout_id: "p1", deleted_at: null, net_amount: 377 }]).get("p1")).toEqual({ count: 1, total: 377, removed: 0, unallocated: 0 });
  });

  it("a partial refund keeps the order at what is left", () => {
    const base = liveLedger();
    // o6 is 2 boxes, 754 net, still pending: refund 377 leaves one box and 377.
    const raw: ReportTx[] = base.transactions.map((t) => (t.id === "o6" ? { ...t, status: "refunded", status_date: "2026-09-18", refund_amount: 377 } : t));
    const n = normalizeLedger(raw, []);
    const o6 = n.transactions.find((t) => t.id === "o6")!;
    expect(o6.net_amount).toBe(377);
    expect(o6.gross_amount).toBe(399);
    expect(n.cashAdjustments).toEqual([]);
    expect(cancellations({ cancelled: n.cancelled, movements: [] }, sept)).toEqual({ count: 1, cancelled: 0, refunded: 1, amount: 377, unitsReturned: 0 });
  });

  it("Data health: Cancelled orders still counted reads 0 when units and cash were handled, and flags what is missing", () => {
    const { input } = cancelledAfterPayout();
    const ok = runHealthChecks({ ...input, audit: null }, LIVE_TODAY).checks.find((c) => c.key === "cancelled_counted")!;
    expect(ok.count).toBe(0);
    const noReturn = { ...input, movements: input.movements.filter((m) => m.id !== "ret-o1"), clawbacks: [] };
    const bad = runHealthChecks({ ...noReturn, audit: null }, LIVE_TODAY).checks.find((c) => c.key === "cancelled_counted")!;
    expect(bad.issues.map((i) => i.detail)).toEqual(["units not returned to stock", "paid out but no clawback"]);
  });

  it("the live-shaped and seed equalities still hold with cancellations in play", () => {
    const { input } = cancelledAfterPayout();
    const home = whoOwesWhom(input, "2026-09-18").owes;
    const sheet = buildBalanceSheet(input, "2026-09-18").partnerBalance;
    expect(sheet.mike).toBe(home!.amount);
    expect(runHealthChecks({ ...input, audit: null }, "2026-09-18").checks.find((c) => c.key === "consistency")!.count).toBe(0);
  });
});
