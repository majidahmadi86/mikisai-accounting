import { describe, expect, it } from "vitest";
import { amountOf, groupSearch, productLine, type SearchRow } from "@/lib/search";

const box = { id: "p1", name: "Coconut sugar Rung Nirand Amphawa", name_th: "", variant: "10 kg box (1 kg x 10 packs)", short_name: "1 kg packs" };
const sample = { id: "p2", name: "Sample sugar A", name_th: "", variant: "10 kg", short_name: "" };
const row = (over: Partial<SearchRow>): SearchRow => ({ id: "t1", date: "2026-09-18", type: "income", order_ref: null, customer_name: null, note: null, net_amount: 0, gross_amount: 0, ...over });

describe("productLine", () => {
  it("joins the short name and the variant without its bracketed pack detail", () => {
    expect(productLine(box)).toBe("1 kg packs · 10 kg box");
  });
  it("falls back to the name when no short name is set", () => {
    expect(productLine(sample)).toBe("Sample sugar A · 10 kg");
  });
  it("never repeats itself when the variant equals the short name", () => {
    expect(productLine({ ...box, variant: "1 kg packs" })).toBe("1 kg packs");
  });
});

describe("amountOf", () => {
  it("reads plain, comma and baht-sign amounts", () => {
    expect(amountOf("377")).toBe(377);
    expect(amountOf("฿1,250.50")).toBe(1250.5);
  });
  it("is null for text and order numbers with letters", () => {
    expect(amountOf("sugar")).toBeNull();
    expect(amountOf("58A1")).toBeNull();
  });
});

describe("groupSearch", () => {
  const rows = [
    row({ id: "a", order_ref: "5812377001", customer_name: "Somchai", net_amount: 311, gross_amount: 377 }),
    row({ id: "b", customer_name: "Khun 377", net_amount: 100, gross_amount: 120 }),
    row({ id: "c", customer_name: "Malee", net_amount: 377, gross_amount: 400 }),
    row({ id: "d", customer_name: "Nok", note: "paid 377 by transfer", net_amount: 50, gross_amount: 50 }),
  ];
  it("puts each row in the first group it matches, in group order", () => {
    const hits = groupSearch("377", rows, [box]);
    expect(hits.map((h) => [h.group, h.id])).toEqual([["order", "a"], ["customer", "b"], ["amount", "c"], ["note", "d"]]);
  });
  it("finds products by short name and links to the product", () => {
    const hits = groupSearch("1 kg", [], [box, sample]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ group: "product", href: "/products/p1", title: "1 kg packs · 10 kg box" });
  });
  it("shows an expense as a negative amount and caps each group at six", () => {
    const many = Array.from({ length: 9 }, (_, i) => row({ id: `x${i}`, type: "expense", note: "boxes", net_amount: 10 }));
    const hits = groupSearch("boxes", many, []);
    expect(hits).toHaveLength(6);
    expect(hits[0].amount).toBe(-10);
  });
  it("returns nothing for an empty query", () => {
    expect(groupSearch("  ", rows, [box])).toEqual([]);
  });
});
