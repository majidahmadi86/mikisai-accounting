"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { PLATFORMS } from "@/lib/types";

const pct = z.coerce.number().min(0).max(100);
const fee = z.coerce.number().min(0).max(99_999);

export async function savePlatformSettings(formData: FormData) {
  const { supabase, profile } = await requireSession();

  const rows = [];
  for (const platform of PLATFORMS) {
    const parsed = z
      .object({ commission_pct: pct, fixed_fee: fee })
      .safeParse({ commission_pct: formData.get(`${platform}.commission_pct`), fixed_fee: formData.get(`${platform}.fixed_fee`) });
    if (!parsed.success) redirect("/settings?error=invalid");
    rows.push({ business_id: profile.business_id, platform, ...parsed.data });
  }

  const { error } = await supabase.from("platform_settings").upsert(rows, { onConflict: "business_id,platform" });
  if (error) redirect("/settings?error=save");

  revalidatePath("/settings");
  revalidatePath("/import");
  redirect("/settings?saved=1");
}
