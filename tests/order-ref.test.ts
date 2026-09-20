import { describe, expect, it } from "vitest";
import { noteWithNoOrderRef, orderRefProblem, splitNoOrderRef } from "@/lib/ledger/order-ref";
import { isOrderRefIssue, toRow, TransactionSchema } from "@/lib/ledger/transaction-input";

const sale = { type: "income", date: "2026-09-20", platform: "tiktok", product_line: "sugar", gross_amount: 399, quantity: 1, received_by: "sai", items: [{ product_id: "00000000-0000-4000-8000-0000000000b1", qty: 1, unit_price: 399 }] };

describe("order ID guard", () => {
  it("refuses a sale with neither an order ID nor a reason, and says it is the order ID", () => {
    const r = TransactionSchema.safeParse(sale);
    expect(r.success).toBe(false);
    if (!r.success) expect(isOrderRefIssue(r.error)).toBe(true);
  });

  it("accepts an order ID, or No order ID with a reason of three characters or more", () => {
    expect(TransactionSchema.safeParse({ ...sale, order_ref: "586103348333545246" }).success).toBe(true);
    expect(TransactionSchema.safeParse({ ...sale, no_order_ref_reason: "cash sale" }).success).toBe(true);
    expect(TransactionSchema.safeParse({ ...sale, no_order_ref_reason: "x" }).success).toBe(false);
    expect(orderRefProblem("", "  ")).toBe("missing");
  });

  it("never asks an expense for an order ID", () => {
    expect(TransactionSchema.safeParse({ type: "expense", date: "2026-09-20", platform: "other", product_line: "sugar", amount: 50, payer: "mike", category_id: "00000000-0000-4000-8000-0000000000c1" }).success).toBe(true);
  });

  it("keeps the reason at the end of the note, once, and drops it when an order ID arrives", () => {
    const parsed = TransactionSchema.parse({ ...sale, note: "friend", no_order_ref_reason: "cash sale" });
    const row = toRow(parsed, "b1");
    expect(row.order_ref).toBeNull();
    expect(row.note).toBe("friend · No order ID: cash sale");
    expect(splitNoOrderRef(row.note)).toEqual({ note: "friend", reason: "cash sale" });
    expect(noteWithNoOrderRef(row.note, "cash sale")).toBe(row.note);
    const later = toRow(TransactionSchema.parse({ ...sale, note: row.note, order_ref: "5861" }), "b1");
    expect(later.note).toBe("friend");
  });
});
