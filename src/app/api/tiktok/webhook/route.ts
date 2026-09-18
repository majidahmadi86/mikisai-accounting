import { NextResponse } from "next/server";
import { ledgerChanged } from "@/lib/data/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/tiktok/client";
import { runTiktokSync, tiktokConfig } from "@/lib/tiktok/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * TikTok webhooks are hints, never data: the body is only checked for its
 * signature and its shop, then the same poll runs. A lost or forged webhook
 * can therefore cost nothing but a little time.
 */
export async function POST(request: Request) {
  const config = tiktokConfig();
  if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const raw = await request.text();
  if (!verifyWebhookSignature(config.appKey, config.appSecret, raw, request.headers.get("authorization"))) return NextResponse.json({ error: "bad_signature" }, { status: 401 });

  let hint: { type?: number; shop_id?: string; timestamp?: number } = {};
  try {
    hint = JSON.parse(raw) as typeof hint;
  } catch {
    // A hint we cannot read is still a hint.
  }
  const admin = createAdminClient();
  let query = admin.from("tiktok_connections").select("business_id").neq("status", "disconnected");
  if (hint.shop_id) query = query.eq("shop_id", String(hint.shop_id));
  const { data: connections } = await query;
  for (const c of connections ?? []) {
    const summary = await runTiktokSync(admin, c.business_id as string, "webhook", { details: { hint_type: hint.type ?? null } });
    if (summary.status === "ok" && (summary.orders_new || summary.orders_updated || summary.payouts)) ledgerChanged(c.business_id as string);
  }
  return NextResponse.json({ ok: true });
}
