"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auditDiff, recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { num, PLATFORMS } from "@/lib/types";

const pct = z.coerce.number().min(0).max(100);
const fee = z.coerce.number().min(0).max(99_999);

export async function savePlatformSettings(formData: FormData) {
  const session = await requireSession();
  const { supabase, profile } = session;

  const rows = [];
  for (const platform of PLATFORMS) {
    const parsed = z
      .object({ commission_pct: pct, fixed_fee: fee })
      .safeParse({ commission_pct: formData.get(`${platform}.commission_pct`), fixed_fee: formData.get(`${platform}.fixed_fee`) });
    if (!parsed.success) redirect("/settings?error=invalid");
    rows.push({ business_id: profile.business_id, platform, ...parsed.data });
  }

  const { data: existing } = await supabase.from("platform_settings").select("platform, commission_pct, fixed_fee");
  const before: Record<string, unknown> = {};
  for (const r of existing ?? []) before[r.platform] = { commission_pct: num(r.commission_pct), fixed_fee: num(r.fixed_fee) };
  const after: Record<string, unknown> = {};
  for (const r of rows) after[r.platform] = { commission_pct: r.commission_pct, fixed_fee: r.fixed_fee };

  const { error } = await supabase.from("platform_settings").upsert(rows, { onConflict: "business_id,platform" });
  if (error) redirect("/settings?error=save");

  const diff = auditDiff(before, after);
  if (Object.keys(diff.after).length) {
    await recordAudit(session, { action: "update", entity_type: "platform_setting", entity_id: null, before: diff.before, after: diff.after });
  }
  ledgerChanged(profile.business_id);
  redirect("/settings?saved=1");
}
