"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeUrl } from "@/lib/tiktok/client";
import { signState } from "@/lib/tiktok/crypto";
import { runTiktokSync, tiktokConfig } from "@/lib/tiktok/sync";

/** Admin: send the browser to TikTok's approval page with a signed state. Sai logs in with the shop there. */
export async function startTiktokAuth() {
  const session = await requireAdmin("business", "tiktok-connect", "/more/connect-tiktok?error=admin_only");
  const { data: app } = await session.supabase.from("tiktok_app_status").select("approval").eq("business_id", session.profile.business_id).maybeSingle();
  if (app?.approval !== "approved") redirect("/more/connect-tiktok?error=not_approved");
  const config = tiktokConfig();
  if (!config || !process.env.TIKTOK_TOKEN_KEY?.trim()) redirect("/more/connect-tiktok?error=not_configured");
  const state = signState({ businessId: session.profile.business_id, userId: session.userId, at: Date.now() }, config.appSecret);
  redirect(authorizeUrl(config, state));
}

/** Admin: say where the Open API application stands. Authorize stays off until approval is marked received. */
export async function saveAppStatus(formData: FormData) {
  const session = await requireAdmin("business", "tiktok-app-status", "/more/connect-tiktok?error=admin_only");
  const approval = formData.get("approval") === "approved" ? "approved" : "pending";
  const rawDate = String(formData.get("ticket_date") ?? "");
  const ticket_date = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawDate) ? rawDate : null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  await session.supabase.from("tiktok_app_status").upsert({ business_id: session.profile.business_id, approval, ticket_date, note, updated_at: new Date().toISOString(), updated_by: session.userId }, { onConflict: "business_id" });
  redirect("/more/connect-tiktok?status_saved=1");
}

/** Admin: run the poll now instead of waiting for the next half hour. */
export async function syncTiktokNow() {
  const session = await requireAdmin("business", "tiktok-sync", "/more/connect-tiktok?error=admin_only");
  const summary = await runTiktokSync(createAdminClient(), session.profile.business_id, "manual");
  // Always: the cached status line on Home must show this run, whatever it found.
  ledgerChanged(session.profile.business_id);
  redirect(`/more/connect-tiktok?synced=${summary.status}`);
}

/** Admin: stop syncing. The tokens are wiped; the ledger rows stay. */
export async function disconnectTiktok() {
  const session = await requireAdmin("business", "tiktok-disconnect", "/more/connect-tiktok?error=admin_only");
  const admin = createAdminClient();
  await admin.from("tiktok_connections").delete().eq("business_id", session.profile.business_id);
  await admin.from("audit_log").insert({ business_id: session.profile.business_id, actor_user_id: session.userId, action: "update", entity_type: "system_correction", entity_id: "tiktok-connection", before: null, after: { event: "tiktok_disconnected" } });
  redirect("/more/connect-tiktok?disconnected=1");
}
