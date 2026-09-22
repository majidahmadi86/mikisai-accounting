"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { PLATFORMS } from "@/lib/types";

const pct = z.coerce.number().min(0).max(100);
const fee = z.coerce.number().min(0).max(99_999);
const days = z.coerce.number().int().min(0).max(120);
const limit = z.coerce.number().min(0).max(99_999_999);

/** Admin only; a contributor's attempt is recorded and refused. Every change is audited by the database triggers. */
export async function savePlatformSettings(formData: FormData) {
  const { supabase, profile } = await requireAdmin("platform_setting", null, "/settings?error=denied");

  const rows = [];
  for (const platform of PLATFORMS) {
    const parsed = z
      .object({ commission_pct: pct, fixed_fee: fee, settlement_lag_days: days, daily_payout_pct: pct })
      .safeParse({
        commission_pct: formData.get(`${platform}.commission_pct`),
        fixed_fee: formData.get(`${platform}.fixed_fee`),
        settlement_lag_days: formData.get(`${platform}.settlement_lag_days`),
        daily_payout_pct: formData.get(`${platform}.daily_payout_pct`),
      });
    if (!parsed.success) redirect("/settings?error=invalid");
    rows.push({ business_id: profile.business_id, platform, ...parsed.data });
  }
  const exposure = limit.safeParse(formData.get("exposure_limit"));
  if (!exposure.success) redirect("/settings?error=invalid");

  const { error } = await supabase.from("platform_settings").upsert(rows, { onConflict: "business_id,platform" });
  if (error) redirect("/settings?error=save");
  // The first day of the business: TikTok orders created before it stay outside every business number.
  const start = formData.get("start_date");
  const startDate = typeof start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null;
  const bufferRaw = Number(formData.get("buy_buffer"));
  const buffer = Number.isInteger(bufferRaw) && bufferRaw >= 0 && bufferRaw <= 1000 ? bufferRaw : null;
  const { error: bErr } = await supabase.from("businesses").update({ exposure_limit: exposure.data, ...(startDate ? { start_date: startDate } : {}), ...(buffer !== null ? { buy_buffer: buffer } : {}) }).eq("id", profile.business_id);
  if (bErr) redirect("/settings?error=save");

  ledgerChanged(profile.business_id);
  redirect("/settings?saved=1");
}
