import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, type AuditAction, type AuditEntity, type AuditLog } from "@/lib/types";

export type AuditFilters = { user?: string; action?: AuditAction; entity?: AuditEntity; from?: string; to?: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export function parseAuditFilters(sp: Record<string, unknown>): AuditFilters {
  const f: AuditFilters = {};
  if (typeof sp.user === "string" && UUID.test(sp.user)) f.user = sp.user;
  if (typeof sp.action === "string" && (AUDIT_ACTIONS as readonly string[]).includes(sp.action)) f.action = sp.action as AuditAction;
  if (typeof sp.entity === "string" && (AUDIT_ENTITIES as readonly string[]).includes(sp.entity)) f.entity = sp.entity as AuditEntity;
  if (typeof sp.from === "string" && ISO.test(sp.from)) f.from = sp.from;
  if (typeof sp.to === "string" && ISO.test(sp.to)) f.to = sp.to;
  return f;
}

export function auditQueryString(f: AuditFilters): string {
  return Object.entries(f)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export async function queryAudit(supabase: SupabaseClient, f: AuditFilters, limit = 200): Promise<{ rows: AuditLog[]; names: Map<string, string> }> {
  let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (f.user) q = q.eq("actor_user_id", f.user);
  if (f.action) q = q.eq("action", f.action);
  if (f.entity) q = q.eq("entity_type", f.entity);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59.999Z`);
  const [{ data }, { data: profiles }] = await Promise.all([q, supabase.from("profiles").select("id, display_name")]);
  return { rows: (data ?? []) as AuditLog[], names: new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string])) };
}

/** Flattens a change into one line per field so it reads well on screen and in a spreadsheet. */
export function auditChanges(row: AuditLog): { field: string; before: string; after: string }[] {
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  if (row.action === "update") {
    const keys = Array.from(new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})]));
    return keys.map((k) => ({ field: k, before: fmt(row.before?.[k]), after: fmt(row.after?.[k]) }));
  }
  const src = row.action === "delete" ? row.before : row.after;
  if (!src) return [];
  return Object.entries(src)
    .filter(([k]) => !["id", "created_at", "transaction_ids", "settlement_ids", "upload_ids"].includes(k))
    .map(([k, v]) => ({ field: k, before: row.action === "delete" ? fmt(v) : "", after: row.action === "delete" ? "" : fmt(v) }));
}
