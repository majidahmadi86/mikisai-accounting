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
  const config = tiktokConfig();
  if (!config || !process.env.TIKTOK_TOKEN_KEY?.trim()) redirect("/more/connect-tiktok?error=not_configured");
  const state = signState({ businessId: session.profile.business_id, userId: session.userId, at: Date.now() }, config.appSecret);
  redirect(authorizeUrl(config, state));
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
