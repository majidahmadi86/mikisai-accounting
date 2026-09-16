import "server-only";
import type { Session } from "@/lib/auth";
import type { AuditAction, AuditEntity } from "@/lib/types";

/**
 * Row-level changes (create, update, delete) are written by database
 * triggers, so the app only records the semantic actions a trigger cannot
 * see. The RPC stamps actor and business from the session itself.
 */
export type SemanticAction = Extract<AuditAction, "confirm_import" | "confirm_payout" | "export">;

export type AuditEntry = {
  action: SemanticAction;
  entity_type: Extract<AuditEntity, "report" | "payout">;
  entity_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/** Columns that never belong in a snapshot. */
const HIDDEN_KEYS = new Set(["business_id"]);

export function auditSnapshot(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (HIDDEN_KEYS.has(k) || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function recordAudit(session: Pick<Session, "supabase">, entry: AuditEntry): Promise<void> {
  const { error } = await session.supabase.rpc("record_action", {
    p_action: entry.action,
    p_entity_type: entry.entity_type,
    p_entity_id: entry.entity_id ?? null,
    p_before: auditSnapshot(entry.before),
    p_after: auditSnapshot(entry.after),
  });
  if (error) console.error("[audit] failed to record", entry.action, entry.entity_type, entry.entity_id, error.message);
}

/** Builds the before/after pair for an update, keeping only keys that changed. Used for settings diffs shown in the UI. */
export function auditDiff(before: Record<string, unknown>, after: Record<string, unknown>): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (HIDDEN_KEYS.has(k)) continue;
    const bv = before[k];
    const av = after[k];
    if (JSON.stringify(bv ?? null) === JSON.stringify(av ?? null)) continue;
    b[k] = bv ?? null;
    a[k] = av ?? null;
  }
  return { before: b, after: a };
}
