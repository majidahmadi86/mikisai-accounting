import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIVE_PRODUCTS } from "@/lib/fixtures/live-shaped";
import { runHealthChecks } from "@/lib/health/checks";
import { liveLedger, LIVE_TODAY } from "@/lib/fixtures/live-shaped";
import type { ExistingOrder } from "@/lib/import/review";
import { detectFileType, detectMapping, mappingIsUsable, ordersFromRows, parseTable, settlementsFromRows } from "@/lib/import/tiktok";
import { financeFromFile, ordersFromFile, skuKey } from "@/lib/tiktok/from-file";
import { mapOrder } from "@/lib/tiktok/map";
import { planSync } from "@/lib/tiktok/plan";
import type { TikTokOrder } from "@/lib/tiktok/types";

const bytes = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/seller-center/${name}`, import.meta.url)));
const ctx = { products: LIVE_PRODUCTS.map((p) => ({ id: p.id, name: p.name, variant: p.variant, product_line: p.product_line, active: p.active, default_price: p.default_price, list_prices: p.list_prices, expected_net_per_unit: p.expected_net_per_unit })), settings: [{ platform: "tiktok" as const, commission_pct: 8, fixed_fee: 0 }] };
const O1 = "579900000000000101"; // completed, 2 boxes, paid 70% then 30%
const O2 = "579900000000000102"; // shipped, paid in the first payout
const O3 = "579900000000000103"; // cancelled
const O4 = "579900000000000104"; // to ship, nothing settled yet
const P1 = "759900000000000001";
const P2 = "759900000000000002";

async function readFiles() {
  const ordersTable = await parseTable(bytes("orders-th.csv"), "orders-th.csv");
  const financeTable = await parseTable(bytes("finance-th.csv"), "finance-th.csv");
  const om = detectMapping(ordersTable.headers, "orders");
  const fm = detectMapping(financeTable.headers, "finance");
  return { ordersTable, financeTable, om, fm, fromOrders: ordersFromFile(ordersFromRows(ordersTable.rows, om), "2026-09-18"), fromFinance: financeFromFile(settlementsFromRows(financeTable.rows, fm)) };
}

const plan = (f: Awaited<ReturnType<typeof readFiles>>, existing: Map<string, ExistingOrder>, known: string[] = []) =>
  planSync({ orders: f.fromOrders.orders, returns: f.fromOrders.returns, settlements: f.fromFinance.settlements, payments: f.fromFinance.payments, ctx, existing, receivedBy: "sai", today: "2026-09-18", skuMap: new Map(), knownPaymentIds: new Set(known) });

describe("Seller Center files, Thai headers and Buddhist years", () => {
  it("detects both file types from their headers and maps every column by meaning", async () => {
    const f = await readFiles();
    expect(detectFileType(f.ordersTable.headers)).toBe("orders");
    expect(detectFileType(f.financeTable.headers)).toBe("finance");
    expect(mappingIsUsable(f.om, "orders")).toEqual({ ok: true, missing: [] });
    expect(mappingIsUsable(f.fm, "finance")).toEqual({ ok: true, missing: [] });
    expect(f.om).toMatchObject({ order_id: "หมายเลขคำสั่งซื้อ", order_status: "สถานะคำสั่งซื้อ", sku_id: "รหัส SKU", variant: "ตัวเลือกสินค้า", quantity: "จำนวน", cancelled_at: "เวลาที่ยกเลิก", buyer_name: "ชื่อผู้ใช้ผู้ซื้อ" });
    expect(f.fm).toMatchObject({ order_id: "รหัสคำสั่งซื้อ/การปรับปรุง", seller_received: "ยอดชำระบัญชีรวม", payment_id: "รหัสการโอนเงิน", payout_date: "วันที่โอนเงิน", payout_amount: "ยอดโอน" });
    // The "please do not edit" row is not an order; 2569 is 2026.
    expect(f.fromOrders.orders.map((o) => [o.order_ref, o.date, o.status, o.quantity])).toEqual([[O1, "2026-09-15", "active", 2], [O2, "2026-09-16", "active", 1], [O3, "2026-09-16", "cancelled", 1], [O4, "2026-09-18", "active", 1]]);
    expect(f.fromOrders.missingStatus).toEqual([]);
  });

  it("one order paid 70% early and 30% later: its settlement is the sum and both payouts name it", async () => {
    const f = await readFiles();
    expect(Object.fromEntries(f.fromFinance.settlements)).toEqual({ [O1]: 734.16, [O2]: 367.08 });
    expect(f.fromFinance.payments).toEqual([
      { external_id: P1, date: "2026-09-17", amount: 880.99, status: "paid", allocations: [{ order_ref: O1, amount: 513.91 }, { order_ref: O2, amount: 367.08 }] },
      { external_id: P2, date: "2026-09-25", amount: 220.25, status: "paid", allocations: [{ order_ref: O1, amount: 220.25 }] },
    ]);
  });

  it("first drop: complete rows are ready, the unsettled one waits, the cancellation applies, payouts carry their orders", async () => {
    const f = await readFiles();
    const p = plan(f, new Map([[O3, { id: "tx-3", date: "2026-09-16", net_amount: 367.08, status: "active" }]]));
    expect(p.auto.map((r) => [r.order_id, r.quantity, r.gross_amount, r.net_amount, r.status])).toEqual([[O1, 2, 798, 734.16, "settled_not_withdrawn"], [O2, 1, 399, 367.08, "settled_not_withdrawn"]]);
    expect(p.autoReview.map((r) => r.order_id)).toEqual([O1, O2]);
    expect(p.queue.map((q) => [q.order_ref, q.reasons])).toEqual([[O4, ["no_settlement"]]]);
    expect(p.statusChanges).toEqual([{ transaction_id: "tx-3", order_ref: O3, order_status: "cancelled", date: "2026-09-18", refund_amount: null }]);
    expect(p.payouts.map((x) => [x.external_ref, x.amount, x.allocations.map((a) => a.order_ref)])).toEqual([[P1, 880.99, [O1, O2]], [P2, 220.25, [O1]]]);
    // The SKU was matched by name and is remembered under its TikTok id.
    expect(p.skus).toEqual([{ sku_key: "id:1729500000000000001", sku_name: "น้ำตาลมะพร้าว รุ่งนิรันดร์ อัมพวา · 10 kg box (1 kg x 10 packs)", product_id: LIVE_PRODUCTS[0].id, learned: true }]);
  });

  it("dropping the same files a second time changes nothing", async () => {
    const f = await readFiles();
    const after = new Map<string, ExistingOrder>([
      [O1, { id: "tx-1", date: "2026-09-15", net_amount: 734.16, status: "active" }],
      [O2, { id: "tx-2", date: "2026-09-16", net_amount: 367.08, status: "active" }],
      [O3, { id: "tx-3", date: "2026-09-16", net_amount: 367.08, status: "cancelled" }],
    ]);
    const p = plan(f, after, [P1, P2]);
    expect(p.auto).toEqual([]);
    expect(p.statusChanges).toEqual([]);
    expect(p.payouts).toEqual([]);
    expect(p.knownPayments).toBe(2);
    expect(p.skipped).toBe(3);
  });

  it("a row from a file and the same order from the API are indistinguishable, and the API never duplicates a CSV import", async () => {
    const f = await readFiles();
    const unix = (iso: string) => Date.parse(iso) / 1000;
    const line = { id: "l", sku_id: "1729500000000000001", sku_name: "10 kg box (1 kg x 10 packs)", product_name: "น้ำตาลมะพร้าว รุ่งนิรันดร์ อัมพวา", sale_price: "399.00" };
    const apiOrder: TikTokOrder = { id: O1, status: "COMPLETED", create_time: unix("2026-09-15T03:10:11Z"), paid_time: unix("2026-09-15T03:12:00Z"), update_time: unix("2026-09-17T02:00:00Z"), recipient_address: { name: "nok_buyer" }, payment: { total_amount: "798.00" }, line_items: [{ ...line, id: "l1" }, { ...line, id: "l2" }] };
    const api = (existing: Map<string, ExistingOrder>) => planSync({ orders: [mapOrder(apiOrder)], returns: [], settlements: new Map([[O1, 734.16]]), payments: [], ctx, existing, receivedBy: "sai", today: "2026-09-18", skuMap: new Map() });
    const fromFile = plan(f, new Map()).auto.find((r) => r.order_id === O1)!;
    expect(api(new Map()).auto[0]).toEqual(fromFile);
    // Imported by CSV first, seen by the API sync afterwards: skipped by order number.
    const seenAgain = api(new Map([[O1, { id: "tx-1", date: "2026-09-15", net_amount: 734.16, status: "active" }]]));
    expect(seenAgain.auto).toEqual([]);
    expect(seenAgain.skipped).toBe(1);
  });

  it("the SKU map decides before the name match, and an unmapped SKU waits for the admin", async () => {
    const f = await readFiles();
    const key = skuKey({ sku_id: "1729500000000000001" });
    const mapped = planSync({ orders: f.fromOrders.orders, returns: [], settlements: f.fromFinance.settlements, payments: [], ctx, existing: new Map(), receivedBy: "sai", today: "2026-09-18", skuMap: new Map([[key, LIVE_PRODUCTS[1].id]]) });
    expect(mapped.auto.every((r) => r.product_id === LIVE_PRODUCTS[1].id)).toBe(true);
    expect(mapped.skus).toEqual([]);
    const awaiting = planSync({ orders: f.fromOrders.orders, returns: [], settlements: f.fromFinance.settlements, payments: [], ctx, existing: new Map(), receivedBy: "sai", today: "2026-09-18", skuMap: new Map([[key, null]]) });
    expect(awaiting.auto).toEqual([]);
    expect(awaiting.queue.every((q) => q.reasons.includes("product_unmatched"))).toBe(true);
  });
});

describe("Data health for the nightly routine", () => {
  const base = () => ({ ...liveLedger(), items: liveLedger().items ?? [], audit: null });
  const count = (input: Parameters<typeof runHealthChecks>[0], key: string, at = `${LIVE_TODAY}T12:00:00Z`) => runHealthChecks(input, LIVE_TODAY, at).checks.find((c) => c.key === key)!.count;
  it("No TikTok import in 36 h", () => {
    expect(count({ ...base(), lastTiktokImport: { ran_at: `${LIVE_TODAY}T01:00:00Z`, source: "csv" } }, "tiktok_import_stale")).toBe(0);
    expect(count({ ...base(), lastTiktokImport: { ran_at: "2026-09-15T01:00:00Z", source: "csv" } }, "tiktok_import_stale")).toBe(1);
    expect(count({ ...base(), lastTiktokImport: null }, "tiktok_import_stale")).toBe(1);
  });
  it("SKUs awaiting mapping, orders missing a status, payout not fully matched", () => {
    expect(count({ ...base(), skusAwaiting: [{ sku_key: "id:9", sku_name: "Mystery" }] }, "skus_awaiting")).toBe(1);
    expect(count({ ...base(), lastTiktokImport: { ran_at: `${LIVE_TODAY}T01:00:00Z`, source: "csv", details: { missing_status: 2 } } }, "orders_missing_status")).toBe(1);
    const payouts = [{ id: "po1", date: "2026-09-17", platform: "tiktok" as const, amount_received: 880.99, received_by: "sai" as const, note: "", external_ref: "759900000000000001" }];
    expect(count({ ...base(), payouts, payoutCoverage: { po1: 513.91 } }, "payout_not_matched")).toBe(1);
    expect(count({ ...base(), payouts, payoutCoverage: { po1: 880.99 } }, "payout_not_matched")).toBe(0);
  });
});
