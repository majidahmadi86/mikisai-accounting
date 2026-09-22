/**
 * The week of 15 to 21 September 2026 from the two real TikTok files
 * (anonymized: no names, addresses, phones, usernames or bank accounts),
 * through the same readers the app uses. v3.2 acceptance:
 *   44 live orders, 52 boxes (38 of 1 kg packs, 14 of 500 g packs) + 1 bag,
 *   6 cancelled before shipping kept out, backlog 8 boxes before the buffer,
 *   TikTok expected 16,050 +/- 50 by the per-order settlement rules,
 *   advance outstanding 10,307, samples in the ledger, and
 *   Home = My Balance = This week to the satang.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_CATEGORIES, CATEGORY_ID } from "@/lib/fixtures/seed-data";
import { BOX_1KG, BOX_500G, LIVE_PRODUCTS, SAMPLE_COSTS, SAMPLE_IDS } from "@/lib/fixtures/live-shaped";
import { consistencyMismatches } from "@/lib/health/checks";
import { readXlsxSheets } from "@/lib/import/table";
import { detectMapping, ordersFromRows, parseTable } from "@/lib/import/tiktok";
import type { TransactionItemRow } from "@/lib/inventory/reports";
import type { Product, StockMovement } from "@/lib/inventory/valuation";
import { buildMyBalance } from "@/lib/my-balance";
import type { ReportTx } from "@/lib/reports/build";
import { readStatement, type SkuEntry } from "@/lib/tiktok/statement";
import { walletState, withoutMirrorTwins, type WalletEvent } from "@/lib/tiktok/wallet";
import { planStatement, type LedgerOrder } from "@/lib/tiktok/statement-plan";
import { withTiktokCash, normalizeLedger, stockPositions, whoOwesWhom, type TruthInput, type TruthTransfer } from "@/lib/truth";
import { buildWeek, weekOf, type WeekInput } from "@/lib/week";

const DIR = join(__dirname, "fixtures", "week-2026-09-15");
const TODAY = "2026-09-22";
const WEEK = weekOf("2026-09-15", TODAY);
const BAG = "00000000-0000-4000-8000-0000000000b6";

// The listings as migration 0028 maps them.
const SKU: Record<string, { product_id: string; multiplier: number }> = {
  "1734376099134211076": { product_id: BOX_1KG, multiplier: 1 },
  "1737509267160204292": { product_id: BOX_500G, multiplier: 1 },
  "1734376099134342148": { product_id: BOX_1KG, multiplier: 3 },
  "1737490537713730564": { product_id: BAG, multiplier: 1 },
};

const bag: Product = { ...LIVE_PRODUCTS[0], id: BAG, name: "Coconut sugar ตรามะลิ", name_th: "น้ำตาลมะพร้าว ตรามะลิ", variant: "1 kg bag", short_name: "1 kg bag", unit_label: "bag", default_cost: 0, default_price: 69, expected_net_per_unit: null };
const products: Product[] = [...LIVE_PRODUCTS, bag];
const at = (d: string) => `${d}T09:00:00Z`;

async function build() {
  const table = await parseTable(new Uint8Array(readFileSync(join(DIR, "orders.csv"))), "orders.csv");
  const orders = ordersFromRows(table.rows, detectMapping(table.headers, "orders"));

  const all: ReportTx[] = [];
  const items: TransactionItemRow[] = [];
  const movements: StockMovement[] = [];
  for (const o of orders) {
    const date = (o.created_at ?? "").slice(0, 10);
    const lines = o.lines.map((l) => ({ ...SKU[(l.sku_id ?? "").trim()], qty: l.quantity }));
    const qty = lines.reduce((a, l) => a + l.qty * l.multiplier, 0);
    const gross = o.order_amount ?? 0;
    const cancelled = o.status === "cancelled" && !o.shipped_at;
    const id = `o-${o.order_id}`;
    all.push({ id, type: "income", date, platform: "tiktok", product_line: "sugar", gross_amount: gross, net_amount: Math.round(gross * 78) / 100, quantity: qty, payer: null, received_by: "sai", category_id: null, customer_name: null, note: "", order_ref: o.order_id, status: cancelled ? "cancelled" : "active", tags: cancelled ? ["cancelled_before_shipping"] : [], created_at: at(date), settlement: { status: "pending", settled_at: null, payout_id: null, paid_amount: 0 } });
    for (const l of lines) {
      items.push({ transaction_id: id, product_id: l.product_id, qty: l.qty * l.multiplier, unit_price: gross / Math.max(1, qty), unit_cost: null });
      if (!cancelled) movements.push({ id: `m-${id}-${l.product_id}`, product_id: l.product_id, qty: -l.qty * l.multiplier, kind: "sale", unit_cost: null, transaction_id: id, date, created_at: at(date) });
    }
  }

  // The week's purchases as corrected in v3.3: 38 x 1 kg and 14 x 500 g, dates and amounts kept.
  const buys = [
    { id: "buy1", date: "2026-09-16", lines: [{ product_id: BOX_1KG, qty: 12 }] },
    { id: "buy2", date: "2026-09-20", lines: [{ product_id: BOX_1KG, qty: 26 }, { product_id: BOX_500G, qty: 6 }] },
    { id: "buy3", date: "2026-09-21", lines: [{ product_id: BOX_500G, qty: 8 }] },
  ];
  for (const b of buys) {
    const qty = b.lines.reduce((a, l) => a + l.qty, 0);
    all.push({ id: b.id, type: "expense", date: b.date, platform: "other", product_line: "sugar", gross_amount: qty * 260, net_amount: qty * 260, quantity: qty, payer: "sai", received_by: null, category_id: CATEGORY_ID.stock, customer_name: null, note: "", created_at: at(b.date), settlement: null });
    for (const l of b.lines) {
      items.push({ transaction_id: b.id, product_id: l.product_id, qty: l.qty, unit_price: 0, unit_cost: 260 });
      movements.push({ id: `m-${b.id}-${l.product_id}`, product_id: l.product_id, qty: l.qty, kind: "purchase", unit_cost: 260, transaction_id: b.id, date: b.date, created_at: at(b.date) });
    }
  }
  // Samples (restored: one row, 3 units at 296.67) and the office expense.
  all.push({ id: "smp", type: "expense", date: "2026-09-14", platform: "other", product_line: "sugar", gross_amount: 890, net_amount: 890, quantity: 3, payer: "sai", received_by: null, category_id: CATEGORY_ID.samples, customer_name: null, note: "3 boxes of sample sugar products", created_at: at("2026-09-14"), settlement: null });
  SAMPLE_IDS.forEach((pid, i) => {
    items.push({ transaction_id: "smp", product_id: pid, qty: 1, unit_price: 0, unit_cost: SAMPLE_COSTS[i] });
    movements.push({ id: `smp-in-${i}`, product_id: pid, qty: 1, kind: "purchase", unit_cost: SAMPLE_COSTS[i], transaction_id: "smp", date: "2026-09-14", created_at: at("2026-09-14") });
    movements.push({ id: `smp-out-${i}`, product_id: pid, qty: -1, kind: "sample", unit_cost: null, transaction_id: "smp", date: "2026-09-14", created_at: at("2026-09-14") });
  });
  all.push({ id: "office", type: "expense", date: "2026-09-16", platform: "other", product_line: "sugar", gross_amount: 156, net_amount: 156, quantity: 1, payer: "sai", received_by: null, category_id: CATEGORY_ID.packaging, customer_name: null, note: "For paper and wrapping", created_at: at("2026-09-16"), settlement: null });

  // The Finance statement, through the v3.1 planner.
  const statement = readStatement(await readXlsxSheets(new Uint8Array(readFileSync(join(DIR, "income.xlsx")))))!;
  const skus = new Map<string, SkuEntry>(Object.entries(SKU).map(([id, v]) => [`id:${id}`, v]));
  const planFor = () => {
    const ledger = new Map<string, LedgerOrder>(all.filter((t) => t.type === "income").map((t) => [t.order_ref!, { id: t.id, order_ref: t.order_ref!, date: t.date, net_amount: t.net_amount, status: t.status ?? "active", settlement_status: "pending" }]));
    const unsettled = all.filter((t) => t.type === "income" && t.status === "active" && !statement.rows.some((r) => r.type === "order" && r.id === t.order_ref)).map((t) => ({ order_ref: t.order_ref!, date: t.date, value: t.net_amount }));
    return planStatement({ statement, startDate: "2026-09-15", receivedBy: "sai", skus, fallbackProductId: BOX_1KG, ledger, knownFacts: new Set(), history: { settled: [], losses: [], events: [] }, knownPayouts: new Set(), unsettled });
  };
  let plan = planFor();

  // Expected net of an order TikTok has not settled: what it paid per box in this statement (the median one-box
  // settlement), times the boxes; the bag at its price less the statement's fee shares. What the app holds as net.
  const oneBox = plan.facts.filter((f) => f.kind === "order" && f.boxes === 1 && !f.pre_business).map((f) => f.settlement_amount).sort((a, b) => a - b);
  const perBox = oneBox[Math.floor(oneBox.length / 2)];
  for (const t of all) {
    if (t.type !== "income" || t.status !== "active") continue;
    const lines = items.filter((i) => i.transaction_id === t.id);
    t.net_amount = Math.round(lines.reduce((a, l) => a + (l.product_id === BAG ? l.qty * 69 * 0.78 : l.qty * perBox), 0) * 100) / 100;
  }
  plan = planFor();
  // What the statement does to the orders: settled ones carry TikTok's net; those a withdrawal paid are in the bank.
  const inBank = new Set(plan.wallet.withdrawals.flatMap((w) => w.orders.map((o) => o.order_ref)));
  for (const st of plan.settle) {
    const t = all.find((x) => x.id === st.transaction_id);
    if (!t) continue;
    t.net_amount = st.net;
    t.settlement = inBank.has(st.order_ref) ? { status: "received_in_bank", settled_at: `${st.settled_date ?? t.date}T00:00:00Z`, payout_id: null, paid_amount: st.net } : { status: "settled_not_withdrawn", settled_at: `${st.settled_date ?? t.date}T00:00:00Z`, payout_id: null, paid_amount: 0 };
  }
  // Mike sent Sai 2,005 on 16 Sept for his half of what she paid.
  const transfers: TruthTransfer[] = [{ id: "tr1", date: "2026-09-16", from_person: "mike", to_person: "sai", amount: 2005, reason: "my_half_of_costs", kind: "settlement", note: "", created_at: at("2026-09-16") } as TruthTransfer];

  const normal = normalizeLedger(withTiktokCash(all, plan.wallet.allocations, new Set(plan.facts.filter((f) => f.kind === "order" && f.settled_date).map((f) => f.order_ref))));
  const input: WeekInput = {
    transactions: normal.transactions,
    cancelled: normal.cancelled,
    cashAdjustments: normal.cashAdjustments,
    transfers,
    items,
    products,
    movements,
    categories: SEED_CATEGORIES,
    facts: plan.facts.map((f) => ({ order_ref: f.order_ref, kind: f.kind, transaction_id: f.transaction_id, settlement_amount: f.settlement_amount, revenue: f.revenue, boxes: f.boxes, fee_transaction: f.fee_transaction, fee_commission: f.fee_commission, fee_commerce_growth: f.fee_commerce_growth, fee_seller_shipping: f.fee_seller_shipping, pre_business: f.pre_business })),
    allocations: plan.wallet.allocations,
  };
  return { input, plan, orders };
}

describe("This week, 15 to 21 September 2026, from the real files", () => {
  it("sold: 44 live orders, 38 x 1 kg + 14 x 500 g = 52 boxes, 1 bag; 6 cancelled before shipping kept out", async () => {
    const { input } = await build();
    const w = buildWeek(input, WEEK, TODAY, 5);
    expect(WEEK).toMatchObject({ from: "2026-09-15", to: "2026-09-21" });
    expect(w.sold.orders).toBe(44);
    const qty = (id: string) => w.sold.variants.find((v) => v.product_id === id)?.qty ?? 0;
    expect(qty(BOX_1KG)).toBe(38);
    expect(qty(BOX_500G)).toBe(14);
    expect(qty(BOX_1KG) + qty(BOX_500G)).toBe(52);
    expect(qty(BAG)).toBe(1);
    expect(w.sold.cancelledBeforeShipping).toBe(6);
  });

  it("v3.3 stock: 1 kg bought 38 sold 38, 500 g bought 14 sold 14, nothing on hand and nothing owed; the bag is bought to order", async () => {
    const { input } = await build();
    const truth = { ...input, payouts: [], categories: SEED_CATEGORIES } as unknown as TruthInput;
    const pos = (id: string) => stockPositions(truth).find((p) => p.product.id === id)!;
    expect(pos(BOX_1KG)).toMatchObject({ bought: 38, sold: 38, onHand: 0, backlog: 0 });
    expect(pos(BOX_500G)).toMatchObject({ bought: 14, sold: 14, onHand: 0, backlog: 0 });
    const w = buildWeek(input, WEEK, TODAY, 5);
    const line = (id: string) => w.buy.find((b) => b.product_id === id);
    expect(line(BOX_1KG)).toMatchObject({ backlog: 0, toBuy: 5 });
    expect(line(BOX_500G)).toMatchObject({ backlog: 0, toBuy: 5 });
    expect(line(BAG)).toMatchObject({ backlog: 1, toBuy: 6 });
  });

  it("TikTok will pay about 16,050 by the per-order rules; advance outstanding 10,307", async () => {
    const { input, plan } = await build();
    const w = buildWeek(input, WEEK, TODAY, 5);
    expect(Math.abs(w.tiktok.expected - 16050)).toBeLessThanOrEqual(50);
    expect(w.tiktok.stillToCome).toBeCloseTo(w.tiktok.expected - w.tiktok.settled - w.tiktok.advanced, 2);
    expect(Math.round(plan.wallet.advanceBalance)).toBe(10307);
    expect(plan.wallet.disbursed).toBeCloseTo(20876, 2);
    expect(plan.wallet.recovered).toBeCloseTo(10569, 2);
  });

  it("stored events from v3.1 held each recovery twice: the replay drops the Withdrawal records copy", () => {
    const d = (kind: "advance_disbursement" | "advance_recovery", date: string, amount: number, mirror = false): WalletEvent => ({ kind, reference: `${kind}-${date}-${mirror}`, date, amount, mirror });
    const events = [d("advance_disbursement", "2026-09-16", 8600), d("advance_recovery", "2026-09-18", -769), d("advance_recovery", "2026-09-18", -769, true), d("advance_recovery", "2026-09-21", -4437), d("advance_recovery", "2026-09-21", -4437, true), d("advance_recovery", "2026-09-22", -100, true)];
    expect(withoutMirrorTwins(events).map((e) => e.amount)).toEqual([8600, -769, -4437, -100]);
    expect(walletState({ settled: [], losses: [], events, unsettled: [] }).advanceBalance).toBe(8600 - 769 - 4437 - 100);
  });

  it("samples are in the ledger, and Home = My Balance = This week to the satang, with no page disagreeing", async () => {
    const { input } = await build();
    expect(input.transactions.find((t) => t.id === "smp")).toMatchObject({ net_amount: 890, category_id: CATEGORY_ID.samples });
    expect(input.items.filter((i) => i.transaction_id === "smp").map((i) => i.unit_cost)).toEqual(SAMPLE_COSTS);
    const home = whoOwesWhom(input, TODAY).owes;
    const mine = buildMyBalance({ transactions: input.transactions, transfers: input.transfers, settings: [], exposureLimit: 0, cashAdjustments: input.cashAdjustments }, "mike", TODAY);
    const myBalance = mine.owedToMe > 0 ? { from: "sai", to: "mike", amount: mine.owedToMe } : mine.iOwe > 0 ? { from: "mike", to: "sai", amount: mine.iOwe } : null;
    const week = buildWeek(input, WEEK, TODAY, 5).cash.owes;
    expect(myBalance).toEqual(home);
    expect(week).toEqual(home);
    const truth: TruthInput = { transactions: input.transactions, transfers: input.transfers, payouts: [], categories: SEED_CATEGORIES, products, movements: input.movements, items: input.items as TransactionItemRow[], cashAdjustments: input.cashAdjustments } as unknown as TruthInput;
    expect(consistencyMismatches(truth, TODAY)).toEqual([]);
  });

  it("v3.3 advance: 10,307 outstanding, 70% of each unsettled business order oldest first, the rest before the business; cash, never profit", async () => {
    const { input, plan } = await build();
    const allocated = plan.wallet.allocations.reduce((a, x) => a + x.amount, 0);
    console.log(`advance outstanding ${plan.wallet.advanceBalance}; allocated to ${plan.wallet.allocations.length} unsettled business orders ${allocated.toFixed(2)}; before the business (Sai alone) ${plan.wallet.advancePreBusiness.toFixed(2)}`);
    expect(Math.round(plan.wallet.advanceBalance)).toBe(10307);
    expect(allocated + plan.wallet.advancePreBusiness).toBeCloseTo(10307, 2);
    // Never more than 70% of an order, never on an order TikTok has settled: paid + advanced <= net.
    for (const a of plan.wallet.allocations) {
      const t = input.transactions.find((x) => x.order_ref === a.order_ref)!;
      expect(a.amount).toBeLessThanOrEqual(Math.round(t.net_amount * 70) / 100 + 0.01);
      expect(plan.facts.some((f) => f.kind === "order" && f.order_ref === a.order_ref)).toBe(false);
    }
    const balance = whoOwesWhom(input, TODAY);
    expect(balance.advancedFromPlatforms.sai).toBeCloseTo(allocated, 2);
    // Profit never includes it.
    const w = buildWeek(input, WEEK, TODAY, 5);
    expect(w.profit.expected).toBeCloseTo(w.tiktok.expected - w.profit.costOfUnits - w.profit.otherCosts, 2);
  });

  // The v3.3 directive expected this under 600. With its rules and the real files it is Sai sends Mike 712.51:
  // costs 14,566 all paid by Sai; Sai received 2,462.58 settled by TikTok + 9,518.43 advanced (+ Mike's 2,005);
  // half the result each. The figure is asserted as it is, and the question is with the founders.
  it("v3.3 one net transfer: one direction, half of the difference between the two sides, the same on Home, My Balance and This week", async () => {
    const { input } = await build();
    const w = buildWeek(input, WEEK, TODAY, 5);
    const home = whoOwesWhom(input, TODAY).owes;
    console.log(`week-1 net transfer: ${home ? `${home.from} sends ${home.to} ${home.amount.toFixed(2)}` : "even"}; reason ${w.cash.reason}; Sai paid ${w.cash.paid.sai} received ${w.cash.received.sai} (advanced ${w.cash.advanced.sai}); Mike paid ${w.cash.paid.mike} received ${w.cash.received.mike}`);
    expect(w.cash.owes).toEqual(home);
    const side = (p: "mike" | "sai") => w.cash.received[p] - w.cash.paid[p];
    expect(home).not.toBeNull();
    expect(home!.from).not.toBe(home!.to);
    expect(home!.amount).toBeCloseTo(Math.abs(side("sai") - side("mike")) / 2, 2);
    expect(home).toMatchObject({ from: "sai", to: "mike" });
    expect(home!.amount).toBeCloseTo(712.51, 2);
  });
});
