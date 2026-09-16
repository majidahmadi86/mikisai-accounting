import { NextResponse } from "next/server";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { loadAuditForHealth, recordHealthRun, runHealth } from "@/lib/health/run";
import { todayIso } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily data health run, called by the Vercel cron in vercel.json. Vercel
 * sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 * One run per business, recorded so Home shows the last check time.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: businesses, error } = await admin.from("businesses").select("id");
  if (error) return NextResponse.json({ error: "businesses" }, { status: 500 });

  const today = todayIso();
  const out: { business_id: string; issues: number }[] = [];
  for (const b of businesses ?? []) {
    const snapshot = await getLedgerSnapshot(b.id);
    const audit = await loadAuditForHealth(admin, b.id);
    const result = await runHealth(snapshot, audit, today);
    await recordHealthRun(admin, b.id, result, "daily", null);
    out.push({ business_id: b.id, issues: result.issues });
  }
  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), businesses: out });
}
