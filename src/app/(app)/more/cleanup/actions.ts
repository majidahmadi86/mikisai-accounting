"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { applyCleanup, cleanRows, loadCleanup, weekCount } from "@/lib/ledger/cleanup-server";
import { weekOf } from "@/lib/week";
import { todayIso } from "@/lib/money";

/**
 * Applies the cleanup the page showed, recomputed on the server so nothing
 * the browser sends can widen it. Runs as the signed-in admin: every row it
 * touches is audited under that name, and one summary row records before and after.
 */
export async function runCleanup(formData: FormData): Promise<void> {
  const session = await requireAdmin("report");
  const { supabase, profile, userId } = session;
  const from = formData.get("from");
  const week = weekOf(typeof from === "string" ? from : null, todayIso());
  const view = await loadCleanup(supabase, profile.business_id, week);
  const outcome = await applyCleanup(supabase, profile.business_id, userId, view.plan, view.rows);
  const after = weekCount(await cleanRows(supabase, profile.business_id), week.from, week.to);
  await recordAudit(session, {
    action: "confirm_import",
    entity_type: "report",
    entity_id: null,
    before: { week, orders: view.before.orders, units: view.before.units, cancelled_before_shipping: view.before.cancelled },
    after: { cleanup: true, week, orders: after.orders, units: after.units, cancelled_before_shipping: after.cancelled, removed: outcome.removed, merged: outcome.merged, cancelled: outcome.cancelled, remapped: outcome.remapped, errors: outcome.errors.slice(0, 20), transaction_ids: [] },
  });
  ledgerChanged(profile.business_id);
  redirect(`/more/cleanup?from=${week.from}&done=${outcome.removed + outcome.merged}.${outcome.cancelled}.${outcome.remapped}.${outcome.errors.length}`);
}
