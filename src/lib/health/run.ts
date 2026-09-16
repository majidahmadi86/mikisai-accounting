import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerSnapshot } from "@/lib/data/ledger";
import type { Role } from "@/lib/types";
import { runHealthChecks, type AuditRowLite, type HealthResult } from "./checks";

/** Audit updates and actor roles for the contributor-edit check; null when the client cannot read the audit log. */
export async function loadAuditForHealth(supabase: SupabaseClient, businessId: string): Promise<{ rows: AuditRowLite[]; roles: Map<string, Role> } | null> {
  const [{ data: rows, error }, { data: profiles }] = await Promise.all([
    supabase.from("audit_log").select("action, entity_type, entity_id, actor_user_id, created_at, before").eq("business_id", businessId).eq("action", "update").order("created_at", { ascending: false }).limit(2000),
    supabase.from("profiles").select("id, role").eq("business_id", businessId),
  ]);
  if (error || !rows) return null;
  return { rows: rows as AuditRowLite[], roles: new Map((profiles ?? []).map((p) => [p.id as string, p.role as Role])) };
}

export async function runHealth(snapshot: LedgerSnapshot, audit: Awaited<ReturnType<typeof loadAuditForHealth>>, today: string): Promise<HealthResult> {
  return runHealthChecks({ ...snapshot, audit }, today);
}

/** Records a run so Home can show when the books were last checked. Never throws: a failed insert must not break the page. */
export async function recordHealthRun(supabase: SupabaseClient, businessId: string, result: HealthResult, source: "page" | "daily", createdBy: string | null): Promise<void> {
  const summary = Object.fromEntries(result.checks.map((c) => [c.key, c.count]));
  const { error } = await supabase.from("health_runs").insert({ business_id: businessId, ran_at: result.ranAt, issues: result.issues, summary, source, created_by: createdBy });
  if (error) console.error("[health] run not recorded", error.message);
}

export type HealthRunRow = { ran_at: string; issues: number; source: string };

export async function lastHealthRun(supabase: SupabaseClient, businessId: string): Promise<HealthRunRow | null> {
  const { data } = await supabase.from("health_runs").select("ran_at, issues, source").eq("business_id", businessId).order("ran_at", { ascending: false }).limit(1).maybeSingle();
  return (data as HealthRunRow | null) ?? null;
}
