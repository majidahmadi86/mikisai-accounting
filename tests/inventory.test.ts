import { describe, expect, it } from "vitest";
import { productProfitability, valueStock, type Product, type StockMovement } from "@/lib/inventory/valuation";
import { buildMyBalance, type MyBalanceInput } from "@/lib/my-balance";
import { REPORT_TODAY, seedLedger } from "@/lib/fixtures/report-data";

const sugar: Product = { id: "p-sugar", name: "Coconut sugar", name_th: "", product_line: "sugar", variant: "10 kg", unit_label: "box", default_cost: 0, default_price: 399, list_prices: {}, low_stock_threshold: 3, active: true, photo_path: null, notes: "", short_name: "", stock_mode: "stocked" };

/** Buy 10 boxes at 260, sell 3 at 399 (one sale), one sample out. */
function movements(): StockMovement[] {
  return [
    { id: "m1", product_id: "p-sugar", qty: 10, kind: "purchase", unit_cost: 260, transaction_id: "buy1", date: "2026-09-01", created_at: "2026-09-01T08:00:00Z" },
    { id: "m2", product_id: "p-sugar", qty: -3, kind: "sale", unit_cost: null, transaction_id: "sale1", date: "2026-09-05", created_at: "2026-09-05T08:00:00Z" },
    { id: "m3", product_id: "p-sugar", qty: -1, kind: "sample", unit_cost: null, transaction_id: "smp1", date: "2026-09-06", created_at: "2026-09-06T08:00:00Z" },
  ];
}

describe("moving average stock valuation", () => {
  const v = valueStock([sugar], movements());
  const row = v.products[0];

  it("stock 6 boxes worth 1,560 at 260 each", () => {
    expect(row.onHand).toBe(6);
    expect(row.avgCost).toBe(260);
    expect(row.value).toBe(1560);
    expect(v.totalValue).toBe(1560);
    expect(row.low).toBe(false);
  });

  it("COGS 780 for the three sold, samples 260 kept apart", () => {
    expect(row.cogs).toBe(780);
    expect(v.cogsByTransaction.get("sale1")).toBe(780);
    expect(row.samplesCost).toBe(260);
    expect(row.samplesQty).toBe(1);
  });

  it("gross margin 417 on 1,197 revenue", () => {
    const profit = productProfitability(v, [{ transaction_id: "sale1", product_id: "p-sugar", qty: 3, unit_price: 399 }], [{ id: "sale1", date: "2026-09-05", net_amount: 1197 }], { from: "2026-09-01", to: "2026-09-30" });
    expect(profit).toHaveLength(1);
    expect(profit[0].revenue).toBe(1197);
    expect(profit[0].cogs).toBe(780);
    expect(profit[0].grossMargin).toBe(417);
    expect(profit[0].marginPct).toBe(34.84);
  });

  it("re-averages when a second purchase arrives at a different cost", () => {
    const more = [...movements(), { id: "m4", product_id: "p-sugar", qty: 6, kind: "purchase" as const, unit_cost: 300, transaction_id: "buy2", date: "2026-09-10", created_at: "2026-09-10T08:00:00Z" }];
    const r = valueStock([sugar], more).products[0];
    // 6 at 260 + 6 at 300 = 3,360 over 12 = 280
    expect(r.onHand).toBe(12);
    expect(r.avgCost).toBe(280);
    expect(r.value).toBe(3360);
  });

  it("flags low stock at the product's threshold", () => {
    const r = valueStock([{ ...sugar, low_stock_threshold: 6 }], movements()).products[0];
    expect(r.low).toBe(true);
  });
});

describe("My Balance stock share", () => {
  it("is half of stock value, shown apart from cash exposure", () => {
    const base = seedLedger();
    const input: MyBalanceInput = {
      transactions: base.transactions,
      transfers: base.transfers.map((t) => ({ ...t, kind: "settlement" as const, reason: "profit_settlement" as const })),
      settings: [],
      exposureLimit: 3000,
      stockValue: 1560,
    };
    const b = buildMyBalance(input, "mike", REPORT_TODAY);
    expect(b.stockShare).toBe(780);
    // Mike holds more than his share in the seed, so nothing is owed to him; exposure is his half of the 801 still waiting.
    expect(b.exposure).toBe(400.5);
  });
});
