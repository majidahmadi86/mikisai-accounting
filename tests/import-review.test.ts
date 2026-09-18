import { describe, expect, it } from "vitest";
import { classifyAgainstLedger, inferQuantity, mergeParsedOrders, mergeParsedPayouts } from "@/lib/import/review";
import type { ParsedOrder } from "@/lib/parse/schema";

const order = (over: Partial<ParsedOrder>): ParsedOrder => ({ order_id: "586000000001", date: null, customer_name: null, product_line: "sugar", gross_amount: null, net_amount: null, status: "pending", order_status: null, note: null, product_name: null, variant: null, quantity: null, ...over });

describe("import review helpers", () => {
  it("two screenshots containing the same order become one row, keeping the fullest values", () => {
    const merged = mergeParsedOrders([
      order({ date: "2026-09-18", net_amount: 377, quantity: null }),
      order({ customer_name: "Nok", quantity: 1, status: "received_in_bank" }),
      order({ order_id: "586000000002", net_amount: 754 }),
      order({ order_id: null, net_amount: 99 }),
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({ order_id: "586000000001", date: "2026-09-18", net_amount: 377, customer_name: "Nok", quantity: 1, status: "received_in_bank" });
  });

  it("a cancellation screen wins over an earlier active screenshot of the same order", () => {
    const merged = mergeParsedOrders([order({ order_status: "active" }), order({ order_status: "cancelled" })]);
    expect(merged[0].order_status).toBe("cancelled");
  });

  it("the same payout seen twice is one payout", () => {
    expect(mergeParsedPayouts([{ date: "2026-09-18", amount: 1055.6, note: "Withdrawal" }, { date: "2026-09-18", amount: 1055.6, note: null }, { date: "2026-09-17", amount: 377, note: null }])).toHaveLength(2);
  });

  it("infers a missing quantity from what you receive when it lands near a whole number of units", () => {
    expect(inferQuantity(754, 377)).toBe(2);
    expect(inferQuantity(1100, 377)).toBe(3); // 2.92
    expect(inferQuantity(560, 377)).toBeNull(); // 1.49
    expect(inferQuantity(377, null)).toBeNull();
  });

  it("classifies rows against the ledger: new, status change, or duplicate skipped", () => {
    expect(classifyAgainstLedger(null, null)).toEqual({ tags: [], include: true });
    expect(classifyAgainstLedger("cancelled", null)).toEqual({ tags: ["cancelled"], include: true });
    const existing = { id: "x", date: "2026-09-15", net_amount: 377, status: "active" as const };
    expect(classifyAgainstLedger("active", existing)).toEqual({ tags: ["already_recorded"], include: false });
    expect(classifyAgainstLedger("cancelled", existing)).toEqual({ tags: ["cancelled", "status_change"], include: true });
    expect(classifyAgainstLedger("cancelled", { ...existing, status: "cancelled" })).toEqual({ tags: ["cancelled", "already_recorded"], include: false });
  });
});
