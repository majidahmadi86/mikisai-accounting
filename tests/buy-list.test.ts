import { describe, expect, it } from "vitest";
import { BOX_1KG, BOX_500G, LIVE_PRODUCTS } from "@/lib/fixtures/live-shaped";
import { bufferFor } from "@/lib/inventory/product-stats";
import type { StockMovement } from "@/lib/inventory/valuation";
import { buildWeek } from "@/lib/week";

const TODAY = "2026-10-12";
const sale = (id: string, product_id: string, date: string, qty = 1): StockMovement => ({ id, product_id, qty: -qty, kind: "sale", unit_cost: null, transaction_id: null, date, created_at: `${date}T09:00:00Z` });
const buy = (id: string, product_id: string, date: string, qty: number): StockMovement => ({ id, product_id, qty, kind: "purchase", unit_cost: 260, transaction_id: null, date, created_at: `${date}T08:00:00Z` });
const week = (movements: StockMovement[], products = LIVE_PRODUCTS) => buildWeek({ transactions: [], cancelled: [], cashAdjustments: [], transfers: [], items: [], products, movements, categories: [], facts: [], allocations: [] }, { key: "week", from: "2026-10-12", to: "2026-10-18" }, TODAY).buy;

describe("Buy this week: per product buffer, every product sold in the last 30 days", () => {
  it("default buffer: 5 for boxes, 0 for anything else; a set value wins, 0 included", () => {
    expect(bufferFor({ unit_label: "box" })).toBe(5);
    expect(bufferFor({ unit_label: "bag" })).toBe(0);
    expect(bufferFor({ unit_label: "box", buffer_units: 0 })).toBe(0);
    expect(bufferFor({ unit_label: "bag", buffer_units: 3 })).toBe(3);
  });

  it("a variant sold 20 days ago stays listed at owed 0 + buffer; one sold 40 days ago drops off", () => {
    const lines = week([buy("b1", BOX_500G, "2026-09-20", 1), sale("s1", BOX_500G, "2026-09-22"), buy("b2", BOX_1KG, "2026-09-01", 1), sale("s2", BOX_1KG, "2026-09-02")]);
    expect(lines.find((l) => l.product_id === BOX_500G)).toMatchObject({ backlog: 0, buffer: 5, toBuy: 5 });
    expect(lines.find((l) => l.product_id === BOX_1KG)).toBeUndefined();
  });

  it("owed units show whenever they exist, with the product's own buffer", () => {
    const products = LIVE_PRODUCTS.map((p) => (p.id === BOX_1KG ? { ...p, buffer_units: 2 } : p));
    const lines = week([sale("s1", BOX_1KG, "2026-08-01", 3)], products);
    expect(lines.find((l) => l.product_id === BOX_1KG)).toMatchObject({ backlog: 3, buffer: 2, toBuy: 5 });
  });
});
