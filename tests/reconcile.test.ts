import { describe, expect, it } from "vitest";
import { derivedUnitPrice, reconcileLines } from "@/lib/ledger/reconcile";

describe("line items reconcile to the sale", () => {
  it("passes when qty x price equals gross within five satang", () => {
    expect(reconcileLines([{ qty: 2, price: 399 }], 798)).toMatchObject({ ok: true, difference: 0 });
    expect(reconcileLines([{ qty: 1, price: 399 }, { qty: 2, price: 150 }], 699.04)).toMatchObject({ ok: true, difference: -0.04 });
  });

  it("fails and reports the difference when they do not", () => {
    // Two boxes sold, line says one.
    expect(reconcileLines([{ qty: 1, price: 399 }], 798)).toMatchObject({ ok: false, sum: 399, difference: -399 });
    expect(reconcileLines([{ qty: 1, price: 399 }, { qty: 1, price: 399 }], 700)).toMatchObject({ ok: false, difference: 98 });
    expect(reconcileLines([], 100).ok).toBe(false);
  });

  it("accepts the unavoidable rounding of a single derived line", () => {
    // 1000 / 3 = 333.33; three lines of that are 999.99, and 1000 / 20 = 50 is exact, but 1000 / 30 = 33.33 x 30 = 999.90 (0.10 off) is still the derived price.
    expect(reconcileLines([{ qty: 3, price: derivedUnitPrice(1000, 3) }], 1000).ok).toBe(true);
    expect(reconcileLines([{ qty: 30, price: derivedUnitPrice(1000, 30) }], 1000).ok).toBe(true);
    expect(reconcileLines([{ qty: 30, price: 33 }], 1000).ok).toBe(false);
  });
});
