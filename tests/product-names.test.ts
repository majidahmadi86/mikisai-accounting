import { describe, expect, it } from "vitest";
import { productLabel } from "@/lib/inventory/reports";
import { productFullName, shortProductName, unitsPerPurchase } from "@/lib/inventory/units";
import { productLine } from "@/lib/search";
import type { Product } from "@/lib/inventory/valuation";
import { buildWeek } from "@/lib/week";
import { unitsBoth } from "@/lib/week-view";
import { t } from "@/lib/i18n/server-free";

const mali = {
  id: "b6",
  name: "Coconut sugar Mali",
  name_en: "Mali brand · 100% pure coconut sugar · 1 kg bag (box of 10 bags)",
  name_th: "น้ำตาลมะพร้าวแท้ 100% ตรามะลิ หอมหวานละมุนจากอัมพวา บรรจุ 1 กก. (1 กล่อง 10 ถุง)",
  variant: "",
  short_name: "Mali 1 kg bag",
  unit_label: "bag",
  purchase_unit_label: "box",
  units_per_purchase_unit: 10,
  product_line: "sugar",
  default_cost: 29.67,
  default_price: 69,
  list_prices: {},
  low_stock_threshold: 3,
  active: true,
  photo_path: null,
  notes: "",
  stock_mode: "buy_to_order",
  expected_net_per_unit: null,
} as unknown as Product;

describe("v3.5 product names", () => {
  it("each name reads in the language in use; English falls back to the key when name_en is empty", () => {
    expect(productFullName(mali, "en")).toBe("Mali brand · 100% pure coconut sugar · 1 kg bag (box of 10 bags)");
    expect(productFullName(mali, "th")).toBe("น้ำตาลมะพร้าวแท้ 100% ตรามะลิ หอมหวานละมุนจากอัมพวา บรรจุ 1 กก. (1 กล่อง 10 ถุง)");
    expect(productFullName({ ...mali, name_en: "" }, "en")).toBe("Coconut sugar Mali");
    expect(productFullName({ ...mali, name_th: "" }, "th")).toBe(mali.name_en);
  });

  it("short name, line and report label all follow it", () => {
    expect(shortProductName(mali, "th")).toBe("Mali 1 kg bag");
    expect(shortProductName({ ...mali, short_name: "" }, "th")).toBe(mali.name_th);
    expect(productLine({ ...mali, short_name: "" }, "th")).toBe(mali.name_th);
    expect(productLabel(mali, "th")).toBe(mali.name_th);
    expect(productLabel({ ...mali, variant: "1 kg" }, "en")).toBe(`${mali.name_en} · 1 kg`);
  });
});

describe("v3.5 bought by the box, sold by the bag", () => {
  const tr = t("en");
  it("a box holds ten bags; a product with no buying unit is one for one", () => {
    expect(unitsPerPurchase(mali)).toBe(10);
    expect(unitsPerPurchase({ units_per_purchase_unit: undefined })).toBe(1);
  });

  it("a purchase of 2 boxes is 20 bags, and This week says both", () => {
    const movements = [{ id: "m1", product_id: mali.id, qty: 2 * unitsPerPurchase(mali), kind: "purchase" as const, unit_cost: 29.67, transaction_id: "t1", date: "2026-09-16", created_at: "2026-09-16T08:00:00Z" }];
    const w = buildWeek({ transactions: [{ id: "t1", type: "expense", date: "2026-09-16", platform: "other", product_line: "sugar", gross_amount: 593.4, net_amount: 593.4, quantity: 20, payer: "sai", received_by: null, category_id: "c1", customer_name: null, note: "", created_at: "2026-09-16T08:00:00Z", settlement: null }], cancelled: [], cashAdjustments: [], transfers: [], items: [{ transaction_id: "t1", product_id: mali.id, qty: 20, unit_cost: 29.67 }], products: [mali], movements, categories: [{ id: "c1", name_en: "Stock purchase", name_th: "", sort: 1, active: true, stock_effect: "purchase" }], facts: [], allocations: [] }, { key: "week", from: "2026-09-14", to: "2026-09-20" }, "2026-09-20");
    const line = w.bought.variants[0];
    expect(line).toMatchObject({ qty: 20, unit: "bag", perPurchaseUnit: 10, purchaseUnit: "box" });
    expect(unitsBoth(tr, line)).toBe("2 box = 20 bag");
    expect(unitsBoth(tr, { ...line, qty: 6 }, true)).toBe("1 box = 6 bag");
  });
});
