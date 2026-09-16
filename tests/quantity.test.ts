import { describe, expect, it } from "vitest";
import { mapVariant, quantityFromText, resolveQuantity, unitSanity } from "@/lib/inventory/quantity";

describe("quantity from text", () => {
  it("reads x2, จำนวน 2, 2 ชิ้น and Thai numerals", () => {
    expect(quantityFromText("น้ำตาลมะพร้าว 10 kg x2")).toBe(2);
    expect(quantityFromText("Coconut sugar x 3")).toBe(3);
    expect(quantityFromText("จำนวน 2")).toBe(2);
    expect(quantityFromText("2 ชิ้น")).toBe(2);
    expect(quantityFromText("จำนวน ๒")).toBe(2);
    expect(quantityFromText("Coconut sugar 10 kg")).toBeNull();
    expect(quantityFromText(null, "", "no count here")).toBeNull();
  });
});

describe("variant mapping to the base 10 kg box", () => {
  it("20 kg and 2 กล่อง are two boxes, 30 kg is three, 10 kg is one", () => {
    expect(mapVariant("20 kg")).toEqual({ baseVariant: "10 kg", multiplier: 2 });
    expect(mapVariant("20กก.")).toEqual({ baseVariant: "10 kg", multiplier: 2 });
    expect(mapVariant("2 กล่อง")).toEqual({ baseVariant: "10 kg", multiplier: 2 });
    expect(mapVariant("30 kg")).toEqual({ baseVariant: "10 kg", multiplier: 3 });
    expect(mapVariant("10 kg")).toEqual({ baseVariant: "10 kg", multiplier: 1 });
    expect(mapVariant("500 g")).toEqual({ baseVariant: "500 g", multiplier: 1 });
    expect(mapVariant(null)).toEqual({ baseVariant: null, multiplier: 1 });
  });

  it("resolves an order: explicit count times variant multiple; null when nothing says how many", () => {
    expect(resolveQuantity({ quantity: 1, variant: "20 kg", product_name: null, note: null })).toMatchObject({ quantity: 2, source: "both" });
    expect(resolveQuantity({ quantity: null, variant: "30 kg", product_name: null, note: null })).toMatchObject({ quantity: 3, source: "variant" });
    expect(resolveQuantity({ quantity: null, variant: "10 kg", product_name: null, note: "น้ำตาล x2" })).toMatchObject({ quantity: 2, source: "explicit" });
    expect(resolveQuantity({ quantity: null, variant: null, product_name: "Coconut sugar", note: null })).toMatchObject({ quantity: null, source: "none" });
  });
});

describe("amount sanity against the standard price", () => {
  it("would have caught two boxes entered as one", () => {
    // 754 received for qty 1 at a 399 standard price: 1.89x, looks like 2 units.
    expect(unitSanity(754, 1, 399)).toEqual({ perUnit: 754, looksLike: 2, entered: 1 });
    expect(unitSanity(377, 1, 399)).toBeNull();
    expect(unitSanity(377, 2, 399)).toEqual({ perUnit: 188.5, looksLike: 1, entered: 2 });
    expect(unitSanity(754, 2, 399)).toBeNull();
    expect(unitSanity(754, 1, 0)).toBeNull();
  });
});
