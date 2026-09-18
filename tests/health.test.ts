import { describe, expect, it } from "vitest";
import { BOX_ID, REAL_TODAY, realLedger } from "@/lib/fixtures/real-sept";
import { runHealthChecks, type HealthInput } from "@/lib/health/checks";

function base(): HealthInput {
  const input = realLedger();
  return { ...input, items: input.items ?? [], transfers: input.transfers as import("@/lib/truth").TruthTransfer[], audit: { rows: [], roles: new Map([["u-mike", "admin"], ["u-sai", "contributor"]]) } };
}

describe("data health", () => {
  it("is green on the clean real fixture, every report total matching the ledger", () => {
    const r = runHealthChecks(base(), REAL_TODAY);
    expect(r.checks.find((c) => c.key === "report_totals")!.issues).toEqual([]);
    expect(r.issues).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("catches two boxes entered as one, a sale without a product, a stale payout and a late contributor edit", () => {
    const input = base();
    // 754 received with qty 1: looks like 2 units.
    const o1 = input.transactions.find((t) => t.id === "o1")!;
    o1.net_amount = 754;
    // A sale with no product line at all.
    input.transactions.push({ ...o1, id: "bare", net_amount: 377, note: "" });
    // Same order id twice.
    o1.order_ref = "586000000000";
    input.transactions.find((t) => t.id === "o2")!.order_ref = "586000000000";
    // Payout 25 days old that nothing was matched to.
    input.payouts.push({ id: "po", date: "2026-08-22", platform: "tiktok", amount_received: 1000, received_by: "sai", note: "" });
    // Contributor edited a row two days after it was created.
    input.audit!.rows.push({ action: "update", entity_type: "transaction", entity_id: "o3", actor_user_id: "u-sai", created_at: "2026-09-17T10:00:00Z", before: { created_at: "2026-09-15T10:00:00Z" } });
    input.audit!.rows.push({ action: "update", entity_type: "transaction", entity_id: "o4", actor_user_id: "u-sai", created_at: "2026-09-15T12:00:00Z", before: { created_at: "2026-09-15T10:00:00Z" } });

    const r = runHealthChecks(input, REAL_TODAY);
    const by = Object.fromEntries(r.checks.map((c) => [c.key, c]));
    expect(by.qty_amount.issues.map((i) => i.id)).toEqual(["o1"]);
    expect(by.qty_amount.issues[0].href).toBe("/transactions/o1/edit");
    expect(by.income_no_product.issues.map((i) => i.id)).toEqual(["bare"]);
    expect(by.duplicate_order_ids.count).toBe(2);
    expect(by.payout_unmatched.issues[0]).toMatchObject({ id: "po", href: "/payouts/po/reconcile" });
    expect(by.late_contributor_edit.issues.map((i) => i.id)).toEqual(["o3"]);
    expect(r.ok).toBe(false);
  });

  it("flags negative stock only on stocked products", () => {
    const input = base();
    expect(runHealthChecks(input, REAL_TODAY).checks.find((c) => c.key === "negative_stocked")!.count).toBe(0);
    input.products.find((p) => p.id === BOX_ID)!.stock_mode = "stocked";
    const r = runHealthChecks(input, REAL_TODAY);
    expect(r.checks.find((c) => c.key === "negative_stocked")!.issues[0].href).toBe(`/products/${BOX_ID}`);
  });

  it("marks the audit check as skipped when the audit log is not readable", () => {
    const r = runHealthChecks({ ...base(), audit: null }, REAL_TODAY);
    expect(r.checks.find((c) => c.key === "late_contributor_edit")).toMatchObject({ skipped: true, adminOnly: true, count: 0 });
  });
});
