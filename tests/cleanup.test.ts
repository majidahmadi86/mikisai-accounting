import { describe, expect, it } from "vitest";
import { duplicateScore, planCleanup, possibleDuplicates, type CleanRow, type FileOrder, type SkuTarget } from "@/lib/ledger/cleanup";

const KG = "p-1kg";
const G500 = "p-500g";
const BAG = "p-bag";
const row = (over: Partial<CleanRow>): CleanRow => ({ id: "x", date: "2026-09-15", order_ref: null, quantity: 1, gross_amount: 339.2, net_amount: 310.82, status: "active", tags: [], note: "", items: [{ product_id: KG, qty: 1 }], imported: true, ...over });
const skus = new Map<string, SkuTarget>([["id:1076", { product_id: KG, multiplier: 1 }], ["id:4292", { product_id: G500, multiplier: 1 }], ["id:0564", { product_id: BAG, multiplier: 1 }]]);

describe("the duplicate rule", () => {
  it("a day apart, same units, customer paid or you receive within five baht", () => {
    expect(duplicateScore(row({}), row({ date: "2026-09-16", net_amount: 307.82 }))).not.toBeNull();
    expect(duplicateScore(row({ net_amount: 301.03, gross_amount: 644.2 }), row({ net_amount: 592.66, gross_amount: 644.2 }))).toBe(0);
    expect(duplicateScore(row({}), row({ date: "2026-09-17" }))).toBeNull();
    expect(duplicateScore(row({}), row({ quantity: 2 }))).toBeNull();
    expect(duplicateScore(row({}), row({ gross_amount: 399, net_amount: 320 }))).toBeNull();
  });
});

describe("cleaning against the Orders file", () => {
  // The three rows typed from screenshots on 15 Sept and the imported orders they duplicate.
  const typed = [
    row({ id: "m1", imported: false, net_amount: 622.91, gross_amount: 578.4, quantity: 2, note: "typed 1" }),
    row({ id: "m2", imported: false, net_amount: 310.82, gross_amount: 339.2, note: "typed 2" }),
    row({ id: "m3", imported: false, net_amount: 301.03, gross_amount: 644.2, note: "typed 3" }),
  ];
  const imported = [
    row({ id: "i5248", order_ref: "5248", date: "2026-09-16", net_amount: 622.91, gross_amount: 578.5, quantity: 2 }),
    row({ id: "i2082", order_ref: "2082", net_amount: 622.91, gross_amount: 598, quantity: 2 }),
    row({ id: "i3425", order_ref: "3425", date: "2026-09-16", net_amount: 307.82, gross_amount: 339.2 }),
    row({ id: "i5694", order_ref: "5694", date: "2026-09-16", net_amount: 312.06, gross_amount: 339.2, status: "refunded" }),
    row({ id: "i6984", order_ref: "6984", net_amount: 592.66, gross_amount: 644.2 }),
    row({ id: "i4292", order_ref: "4292x", gross_amount: 399, net_amount: 305.57, items: [{ product_id: KG, qty: 1 }] }),
    row({ id: "ibag", order_ref: "bag", items: [{ product_id: KG, qty: 1 }], gross_amount: 98, net_amount: 60 }),
  ];
  const orders = new Map<string, FileOrder>([
    ["5694", { order_ref: "5694", cancelled: true, shipped: false, lines: [{ sku_id: "1076", qty: 1 }] }],
    ["3425", { order_ref: "3425", cancelled: true, shipped: true, lines: [{ sku_id: "1076", qty: 1 }] }],
    ["4292x", { order_ref: "4292x", cancelled: false, shipped: true, lines: [{ sku_id: "4292", qty: 1 }] }],
    ["bag", { order_ref: "bag", cancelled: false, shipped: true, lines: [{ sku_id: "0564", qty: 1 }] }],
    ["6984", { order_ref: "6984", cancelled: false, shipped: true, lines: [{ sku_id: "1076", qty: 1 }] }],
  ]);

  it("merges each typed row into the imported order whose customer-paid amount matches, keeping the imported row", () => {
    const p = planCleanup([...typed, ...imported], orders, skus);
    expect(p.merges.map((m) => [m.remove, m.keep])).toEqual(expect.arrayContaining([["m1", "i5248"], ["m2", "i3425"], ["m3", "i6984"]]));
    expect(p.merges).toHaveLength(3);
    expect(p.merges.find((m) => m.remove === "m1")!.note).toBe("typed 1");
    expect(p.unmatched).toEqual([]);
  });

  it("never removes a typed row that matches nothing: it waits for the admin", () => {
    const p = planCleanup([row({ id: "lonely", imported: false, gross_amount: 999, net_amount: 900 }), ...imported], orders, skus);
    expect(p.merges).toEqual([]);
    expect(p.unmatched.map((u) => u.id)).toEqual(["lonely"]);
  });

  it("keeps the imported row of two with one order number", () => {
    const p = planCleanup([row({ id: "typedRef", order_ref: "777", imported: false }), row({ id: "fileRef", order_ref: "777", imported: true })], new Map(), skus);
    expect(p.exactDuplicates).toEqual([{ keep: "fileRef", remove: ["typedRef"], order_ref: "777" }]);
  });

  it("a cancellation with no shipped time is not a sale; one after shipping keeps the return flow", () => {
    const p = planCleanup(imported, orders, skus);
    expect(p.cancelBeforeShipping.map((c) => c.order_ref)).toEqual(["5694"]);
    const again = planCleanup([{ ...imported[3], tags: ["cancelled_before_shipping"], status: "cancelled" }], orders, skus);
    expect(again.cancelBeforeShipping).toEqual([]);
  });

  it("moves a sale to the variant its listing sells: 500 g packs, the bag", () => {
    const p = planCleanup(imported, orders, skus);
    expect(p.remaps.map((r) => [r.order_ref, r.to])).toEqual([["4292x", G500], ["bag", BAG]]);
  });

  it("Data health uses the same rule", () => {
    expect(possibleDuplicates([...typed, ...imported]).map((m) => m.remove).sort()).toEqual(["m1", "m2", "m3"]);
  });
});
