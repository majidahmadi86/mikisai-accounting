import "server-only";
import type { Session } from "@/lib/auth";
import type { AuditAction, AuditEntity } from "@/lib/types";

export type AuditEntry = {
  action: AuditAction;
  entity_type: AuditEntity;
  entity_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/** Columns that never belong in a diff. */
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

/**
 * Appends one row to audit_log. Called by every server-side mutation after it
 * succeeds. Runs through the caller's RLS session so the row is stamped with
 * the real actor; a failure is logged loudly but never hides the mutation.
 */
export async function recordAudit(session: Pick<Session, "supabase" | "userId" | "profile">, entry: AuditEntry): Promise<void> {
  const { error } = await session.supabase.from("audit_log").insert({
    business_id: session.profile.business_id,
    actor_user_id: session.userId,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    before: auditSnapshot(entry.before),
    after: auditSnapshot(entry.after),
  });
  if (error) console.error("[audit] failed to write", entry.action, entry.entity_type, entry.entity_id, error.message);
}

/** Builds the before/after pair for an update, keeping only keys that changed. */
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
