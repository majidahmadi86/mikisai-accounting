import { describe, expect, it } from "vitest";
import { auditDiff, auditSnapshot, recordAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit-query";
import type { AuditLog } from "@/lib/types";

type Call = { fn: string; args: Record<string, unknown> };

/** Minimal stand-in for the Supabase client: records RPC calls, never touches the network. */
function fakeSession(fail = false) {
  const calls: Call[] = [];
  const supabase = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return { error: fail ? { message: "boom" } : null };
    },
  };
  return { calls, session: { supabase: supabase as never } };
}

describe("recordAudit", () => {
  it("records semantic actions through record_action with snapshots stripped of business_id", async () => {
    const { calls, session } = fakeSession();
    await recordAudit(session, {
      action: "confirm_payout",
      entity_type: "payout",
      entity_id: "p1",
      before: { settlement_ids: ["a"] },
      after: { settlement_ids: ["a", "b"], business_id: "biz-1", orders: 2 },
    });
    expect(calls).toEqual([
      {
        fn: "record_action",
        args: { p_action: "confirm_payout", p_entity_type: "payout", p_entity_id: "p1", p_before: { settlement_ids: ["a"] }, p_after: { settlement_ids: ["a", "b"], orders: 2 } },
      },
    ]);
  });

  it("never throws when the RPC fails, so the mutation still completes", async () => {
    const { session } = fakeSession(true);
    await expect(recordAudit(session, { action: "export", entity_type: "report", entity_id: "pl", after: { format: "pdf" } })).resolves.toBeUndefined();
  });
});

describe("auditDiff", () => {
  it("keeps only keys whose value changed", () => {
    const d = auditDiff({ id: "1", net_amount: 315, note: "a", business_id: "b" }, { id: "1", net_amount: 320, note: "a", business_id: "b" });
    expect(d).toEqual({ before: { net_amount: 315 }, after: { net_amount: 320 } });
  });

  it("treats added and removed keys as changes, and equal objects as no change", () => {
    const d = auditDiff({ customer_name: null, settlement_status: "pending" }, { customer_name: "Pim", settlement_status: "pending" });
    expect(d).toEqual({ before: { customer_name: null }, after: { customer_name: "Pim" } });
    expect(auditDiff({ a: { x: 1 } }, { a: { x: 1 } })).toEqual({ before: {}, after: {} });
  });

  it("snapshot drops undefined values and business_id", () => {
    expect(auditSnapshot({ a: 1, b: undefined, business_id: "x" })).toEqual({ a: 1 });
    expect(auditSnapshot(null)).toBeNull();
  });
});

describe("auditChanges", () => {
  const base = { id: "a1", business_id: "b", actor_user_id: "u", entity_type: "transaction" as const, entity_id: "t", created_at: "2026-09-16T00:00:00Z" };

  it("flattens an update into one line per field", () => {
    const row: AuditLog = { ...base, action: "update", before: { net_amount: 315, note: "" }, after: { net_amount: 320, note: "fixed" } };
    expect(auditChanges(row)).toEqual([
      { field: "net_amount", before: "315", after: "320" },
      { field: "note", before: "", after: "fixed" },
    ]);
  });

  it("shows created values in the after column and deleted values in the before column", () => {
    const created: AuditLog = { ...base, action: "create", before: null, after: { id: "t", net_amount: 315 } };
    expect(auditChanges(created)).toEqual([{ field: "net_amount", before: "", after: "315" }]);
    const deleted: AuditLog = { ...base, action: "delete", before: { id: "t", net_amount: 315 }, after: null };
    expect(auditChanges(deleted)).toEqual([{ field: "net_amount", before: "315", after: "" }]);
  });
});
