import { describe, expect, it } from "vitest";
import { statementHealth, type MoneyFact } from "@/lib/health/tiktok-money";

const fact = (order_ref: string): MoneyFact => ({ order_ref, kind: "order", transaction_id: null, settled_date: "2026-09-18", settlement_amount: 300, fee_seller_shipping: -45, chargeable_weight_g: null, boxes: 1, overweight: false, pre_business: false, ledger_net_before: null });

describe("Data health: Duplicate TikTok statement rows", () => {
  it("lists a stored advance copy and an order stored twice; nothing when clean", () => {
    const clean = statementHealth({ startDate: "2026-09-15", allocations: [], facts: [fact("1"), fact("2")], periods: [], duplicates: [] }, [], undefined, "2026-09-22");
    expect(clean.statement_duplicates).toEqual([]);
    const dirty = statementHealth({ startDate: "2026-09-15", allocations: [], facts: [fact("1"), fact("1")], periods: [], duplicates: [{ id: "w1", kind: "advance_recovery", date: "2026-09-21", amount: -4437 }] }, [], undefined, "2026-09-22");
    expect(dirty.statement_duplicates.map((i) => i.id)).toEqual(["w1", "1:order"]);
  });
});
