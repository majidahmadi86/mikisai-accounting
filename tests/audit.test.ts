import { describe, expect, it } from "vitest";
import { auditDiff, auditSnapshot, recordAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit-query";
import type { AuditLog } from "@/lib/types";

type Inserted = { table: string; row: Record<string, unknown> };

/** Minimal stand-in for the Supabase client: records inserts, never touches the network. */
function fakeSession(fail = false) {
  const inserted: Inserted[] = [];
  const supabase = {
    from(table: string) {
      return {
        async insert(row: Record<string, unknown>) {
          inserted.push({ table, row });
          return { error: fail ? { message: "boom" } : null };
        },
      };
    },
  };
  return { inserted, session: { supabase: supabase as never, userId: "user-1", profile: { id: "user-1", business_id: "biz-1", display_name: "Mike" as const } } };
}

describe("recordAudit", () => {
  it("writes actor, business, action, entity and snapshots without business_id", async () => {
    const { inserted, session } = fakeSession();
    await recordAudit(session, {
      action: "create",
      entity_type: "transaction",
      entity_id: "tx-1",
      after: { id: "tx-1", business_id: "biz-1", net_amount: 315, note: "" },
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe("audit_log");
    expect(inserted[0].row).toEqual({
      business_id: "biz-1",
      actor_user_id: "user-1",
      action: "create",
      entity_type: "transaction",
      entity_id: "tx-1",
      before: null,
      after: { id: "tx-1", net_amount: 315, note: "" },
    });
  });

  it("never throws when the insert fails, so the mutation still completes", async () => {
    const { session } = fakeSession(true);
    await expect(recordAudit(session, { action: "delete", entity_type: "payout", entity_id: "p1", before: { id: "p1" } })).resolves.toBeUndefined();
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
