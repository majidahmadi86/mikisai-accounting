import { describe, expect, it } from "vitest";
import { ItemSchema, TransactionSchema } from "@/lib/ledger/transaction-input";
import { marginVsPlan, productDetailStats, salePriceFor } from "@/lib/inventory/product-stats";
import { valueStock, type Product, type StockMovement } from "@/lib/inventory/valuation";

const box: Product = {
  id: "b1",
  name: "Coconut sugar Rung Nirand Amphawa",
  name_th: "น้ำตาลมะพร้าว",
  product_line: "sugar",
  variant: "10 kg box (1 kg x 10 packs)",
  unit_label: "box",
  default_cost: 260,
  default_price: 399,
  list_prices: { tiktok: 399 },
  low_stock_threshold: 3,
  active: true,
  photo_path: null,
  notes: "",
  short_name: "",
  stock_mode: "buy_to_order",
  expected_net_per_unit: null,
};

describe("quantities are whole units", () => {
  it("accepts 1 and 10, rejects 0, 1.5 and 0.001", () => {
    expect(ItemSchema.safeParse({ product_id: "00000000-0000-4000-8000-0000000000b1", qty: 1 }).success).toBe(true);
    expect(ItemSchema.safeParse({ product_id: "00000000-0000-4000-8000-0000000000b1", qty: "10" }).success).toBe(true);
    expect(ItemSchema.safeParse({ product_id: "00000000-0000-4000-8000-0000000000b1", qty: 0 }).success).toBe(false);
    expect(ItemSchema.safeParse({ product_id: "00000000-0000-4000-8000-0000000000b1", qty: 1.5 }).success).toBe(false);
    expect(ItemSchema.safeParse({ product_id: "00000000-0000-4000-8000-0000000000b1", qty: 0.001 }).success).toBe(false);
  });

  it("a sale with qty 1 and one with qty 10 both validate as a whole", () => {
    for (const qty of [1, 10]) {
      const r = TransactionSchema.safeParse({ type: "income", date: "2026-09-16", platform: "tiktok", product_line: "sugar", gross_amount: 399 * qty, quantity: qty, received_by: "sai", order_ref: "586000000000000001", items: [{ product_id: "00000000-0000-4000-8000-0000000000b1", qty, unit_price: 399 }] });
      expect(r.success).toBe(true);
    }
  });
});

describe("standard prices", () => {
  it("uses the platform list price when set, else the standard price", () => {
    expect(salePriceFor(box, "tiktok")).toBe(399);
    expect(salePriceFor({ ...box, list_prices: { tiktok: 379 } }, "tiktok")).toBe(379);
    expect(salePriceFor(box, "shopee")).toBe(399);
    expect(salePriceFor({ ...box, default_price: 0 }, "shopee")).toBe(0);
  });

  it("expected vs actual margin flags a shortfall over 5%", () => {
    const rows = marginVsPlan([
      { product: box, qty: 3, grossMargin: 417 }, // plan (399-260)*3 = 417
      { product: box, qty: 3, grossMargin: 380 }, // 8.9% worse
      { product: box, qty: 3, grossMargin: 400 }, // 4.1% worse, inside tolerance
    ]);
    expect(rows[0]).toMatchObject({ expectedMargin: 417, variance: 0, variancePct: 0, worse: false });
    expect(rows[1]).toMatchObject({ expectedMargin: 417, variance: -37, variancePct: -8.87, worse: true });
    expect(rows[2].worse).toBe(false);
  });
});

describe("product detail stats", () => {
  const movements: StockMovement[] = [
    { id: "m1", product_id: "b1", qty: 10, kind: "purchase", unit_cost: 270, transaction_id: "buy", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" },
    { id: "m2", product_id: "b1", qty: -2, kind: "sale", unit_cost: null, transaction_id: "s1", date: "2026-09-14", created_at: "2026-09-14T00:00:00Z" },
    { id: "m3", product_id: "b1", qty: -1, kind: "sale", unit_cost: null, transaction_id: "s2", date: "2026-09-02", created_at: "2026-09-02T00:00:00Z" },
  ];
  const valuation = valueStock([box], movements);
  const stats = productDetailStats(
    valuation.products[0],
    [
      { transaction_id: "s1", product_id: "b1", qty: 2, unit_price: 399, unit_cost: null },
      { transaction_id: "s2", product_id: "b1", qty: 1, unit_price: 399, unit_cost: null },
    ],
    [
      { id: "s1", date: "2026-09-14", net_amount: 740 },
      { id: "s2", date: "2026-09-02", net_amount: 370 },
    ],
    movements,
    valuation.cogsByTransaction,
    "2026-09-16",
  );

  it("reports stock, variance against standard cost, 7 and 30 day sales, margin and dates", () => {
    expect(stats.onHand).toBe(7);
    expect(stats.avgCost).toBe(270);
    expect(stats.costVariance).toBe(10);
    expect(stats.costVariancePct).toBe(3.85);
    expect(stats.sold7).toBe(2);
    expect(stats.sold30).toBe(3);
    expect(stats.revenue30).toBe(1110);
    expect(stats.cogs30).toBe(810);
    expect(stats.grossMargin30).toBe(300);
    expect(stats.lastPurchase).toBe("2026-09-01");
    expect(stats.lastSale).toBe("2026-09-14");
  });
});
