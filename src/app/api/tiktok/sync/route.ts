import { NextResponse } from "next/server";
import { ledgerChanged } from "@/lib/data/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTiktokSync } from "@/lib/tiktok/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The poll, every 30 minutes from the Vercel cron in vercel.json. Vercel sends
 * "Authorization: Bearer <CRON_SECRET>"; anything else is refused. One sync
 * per connected business.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: connections } = await admin.from("tiktok_connections").select("business_id").neq("status", "disconnected");
  const out = [];
  for (const c of connections ?? []) {
    const summary = await runTiktokSync(admin, c.business_id as string, "cron");
    if (summary.status === "ok" && (summary.orders_new || summary.orders_updated || summary.payouts)) ledgerChanged(c.business_id as string);
    out.push({ business_id: c.business_id, ...summary });
  }
  return NextResponse.json({ synced: out.length, results: out });
}
