import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIVE_PRODUCTS } from "@/lib/fixtures/live-shaped";
import type { ExistingOrder } from "@/lib/import/review";
import { bangkokDate, mapOrder, mapPayment, mapReturn, mapStatementTransactions } from "@/lib/tiktok/map";
import { planSync } from "@/lib/tiktok/plan";
import { relativeTime, tiktokProblems, type TiktokStatus } from "@/lib/tiktok/status";
import type { TikTokOrder, TikTokPayment, TikTokReturn, TikTokStatementTransaction } from "@/lib/tiktok/types";

const data = <T,>(name: string): T => (JSON.parse(readFileSync(new URL(`./fixtures/tiktok/${name}`, import.meta.url), "utf8")) as { data: T }).data;
const orders = [...data<{ orders: TikTokOrder[] }>("orders-search-page1.json").orders, ...data<{ orders: TikTokOrder[] }>("orders-search-page2.json").orders];
const returns = data<{ return_orders: TikTokReturn[] }>("returns-search.json").return_orders;
const tx1 = data<{ statement_transactions: TikTokStatementTransaction[] }>("statement-transactions-7400000000000000001.json").statement_transactions;
const tx2 = data<{ statement_transactions: TikTokStatementTransaction[] }>("statement-transactions-7400000000000000002.json").statement_transactions;
const payments = data<{ payments: TikTokPayment[] }>("payments-search.json").payments;

const O1 = "576461413038220101"; // completed, 2 units of one sku, settled 734.16
const O2 = "576461413038220102"; // awaiting shipment, no settlement yet
const O3 = "576461413038220103"; // cancelled
const O4 = "576461413038220104"; // delivered, two different skus, refunded 377

const ctx = { products: LIVE_PRODUCTS.map((p) => ({ id: p.id, name: p.name, variant: p.variant, product_line: p.product_line, active: p.active, default_price: p.default_price, list_prices: p.list_prices, expected_net_per_unit: p.expected_net_per_unit })), settings: [{ platform: "tiktok" as const, commission_pct: 8, fixed_fee: 0 }] };

describe("mapping TikTok JSON", () => {
  it("merges one line item per unit into quantities and reads the money", () => {
    const o = mapOrder(orders.find((x) => x.id === O1)!);
    expect(o).toMatchObject({ order_ref: O1, status: "active", quantity: 2, gross_amount: 798, delivered: true, buyer_name: "คุณนก", date: "2026-09-15" });
    expect(o.lines).toEqual([{ sku_id: "sku-1kg", sku_name: "10 kg box (1 kg x 10 packs)", product_name: "น้ำตาลมะพร้าว รุ่งนิรันดร์ อัมพวา", seller_sku: null, quantity: 2, sale_price: 399 }]);
    expect(mapOrder(orders.find((x) => x.id === O3)!)).toMatchObject({ status: "cancelled", cancel_reason: "Buyer changed mind" });
    expect(mapOrder(orders.find((x) => x.id === O4)!).lines).toHaveLength(2);
  });

  it("a day in Bangkok, not in UTC", () => {
    // 17 Sept 17:30 UTC is already 18 Sept 00:30 in Bangkok.
    expect(bangkokDate(Date.UTC(2026, 8, 17, 17, 30) / 1000)).toBe("2026-09-18");
    expect(mapOrder(orders.find((x) => x.id === O2)!).date).toBe("2026-09-18");
  });

  it("returns: completed refunds count, pending ones wait, replacements are nothing", () => {
    const mapped = returns.map(mapReturn);
    expect(mapped[0]).toMatchObject({ order_ref: O4, kind: "refunded", refund_amount: 377, completed: true });
    expect(mapped[1]).toMatchObject({ order_ref: O1, completed: false });
    expect(mapped[2]).toBeNull();
  });

  it("settlement per order from ORDER transactions only; payouts from paid payments", () => {
    const s = mapStatementTransactions([...tx1, ...tx2]);
    expect(Object.fromEntries(s)).toEqual({ [O1]: 734.16, [O4]: 734.16 });
    expect(payments.map(mapPayment)).toEqual([
      { external_id: "7500000000000000001", date: "2026-09-17", amount: 734.16, status: "paid" },
      { external_id: "7500000000000000002", date: "2026-09-18", amount: 724.16, status: "processing" },
    ]);
    expect(mapPayment({ id: "x", status: "PAID", amount: { value: "0" }, paid_time: 1 })).toBeNull();
  });
});

describe("planning a sync", () => {
  const base = (existing: Map<string, ExistingOrder> = new Map()) =>
    planSync({ orders: orders.map(mapOrder), returns: returns.map(mapReturn).filter((r) => r !== null), settlements: mapStatementTransactions([...tx1, ...tx2]), payments: payments.map(mapPayment).filter((p) => p !== null), ctx, existing, receivedBy: "sai", today: "2026-09-18" });

  it("auto-confirms only rows with order number, quantity, product and settlement; the rest wait for review", () => {
    const plan = base();
    expect(plan.auto.map((r) => r.order_id)).toEqual([O1]);
    expect(plan.auto[0]).toMatchObject({ platform: "tiktok", quantity: 2, gross_amount: 798, net_amount: 734.16, status: "settled_not_withdrawn", received_by: "sai", order_status: "active", product_id: LIVE_PRODUCTS[0].id });
    expect(Object.fromEntries(plan.queue.map((q) => [q.order_ref, q.reasons]))).toEqual({ [O4]: ["multiple_products"], [O2]: ["no_settlement"] });
    // The queued row is the same review row the CSV import would show, gold tag included.
    expect(plan.queue.find((q) => q.order_ref === O2)!.row.tags).toContain("net_estimated");
    expect(plan.queue.find((q) => q.order_ref === O4)!.row).toMatchObject({ order_status: "refunded", net_amount: 734.16 });
    // A cancelled order that was never recorded is not a sale.
    expect(plan.ignored).toBe(1);
    expect(plan.statusChanges).toEqual([]);
    expect(plan.payouts).toEqual([{ date: "2026-09-17", platform: "tiktok", amount: 734.16, received_by: "sai", note: "TikTok payment 7500000000000000001", external_ref: "7500000000000000001", allocations: [] }]);
  });

  it("dedupes against the ledger by order number and applies cancellations and refunds to orders already there", () => {
    const existing = new Map<string, ExistingOrder>([
      [O1, { id: "tx-1", date: "2026-09-15", net_amount: 734.16, status: "active" }],
      [O3, { id: "tx-3", date: "2026-09-16", net_amount: 367.08, status: "active" }],
      [O4, { id: "tx-4", date: "2026-09-14", net_amount: 734.16, status: "active" }],
    ]);
    const plan = base(existing);
    expect(plan.auto).toEqual([]);
    expect(plan.skipped).toBe(1); // O1 typed in by hand or imported from CSV earlier: never twice
    expect(plan.statusChanges).toEqual([
      { transaction_id: "tx-4", order_ref: O4, order_status: "refunded", date: "2026-09-17", refund_amount: 377 },
      { transaction_id: "tx-3", order_ref: O3, order_status: "cancelled", date: "2026-09-18", refund_amount: null },
    ]);
    // Already cancelled in the ledger: nothing to do a second time.
    const again = base(new Map([[O3, { id: "tx-3", date: "2026-09-16", net_amount: 367.08, status: "cancelled" as const }]]));
    expect(again.statusChanges).toEqual([]);
  });
});

describe("connection status", () => {
  const ok: TiktokStatus = { configured: true, connected: true, state: "connected", seller_name: "MikiSai", shop_name: "MikiSai", connected_at: "2026-09-18T00:00:00Z", last_sync_at: "2026-09-18T03:48:00Z", refresh_expires_at: "2027-09-18T00:00:00Z", last_error: "", last_log: null, queued: 0 };
  const now = Date.parse("2026-09-18T04:00:00Z");
  it("is quiet when healthy and when not connected", () => {
    expect(tiktokProblems(ok, now)).toEqual([]);
    expect(tiktokProblems({ ...ok, connected: false, state: "not_connected" }, now)).toEqual([]);
    expect(tiktokProblems(null, now)).toEqual([]);
  });
  it("raises a failed token refresh, a failed sync, a stale poll and an authorization about to run out", () => {
    expect(tiktokProblems({ ...ok, state: "expired", last_error: "token_refresh_failed: refresh token expired" }, now).map((p) => p.id)).toEqual(["tiktok-token"]);
    expect(tiktokProblems({ ...ok, last_log: { id: "l", trigger: "cron", started_at: "", finished_at: "", status: "error", orders_new: 0, orders_updated: 0, cancellations: 0, refunds: 0, payouts: 0, queued: 0, error: "503" } }, now).map((p) => p.id)).toEqual(["tiktok-last"]);
    expect(tiktokProblems({ ...ok, last_sync_at: "2026-09-17T20:00:00Z" }, now).map((p) => p.id)).toEqual(["tiktok-stale"]);
    expect(tiktokProblems({ ...ok, refresh_expires_at: "2026-09-21T00:00:00Z" }, now).map((p) => p.id)).toEqual(["tiktok-refresh"]);
  });
  it("says 12 min ago", () => {
    expect(relativeTime("2026-09-18T03:48:00Z", "en", now)).toBe("12 min ago");
    expect(relativeTime("2026-09-18T03:48:00Z", "th", now)).toBe("12 นาทีที่แล้ว");
  });
});
