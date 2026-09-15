"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireSession } from "@/lib/auth";
import { ledgerTag } from "@/lib/data/ledger";
import { insightsTag } from "@/lib/insights/narrative";

/** "Refresh now": drops the cached snapshot and narrative for this business. */
export async function refreshInsights() {
  const { profile } = await requireSession();
  updateTag(ledgerTag(profile.business_id));
  updateTag(insightsTag(profile.business_id));
  revalidatePath("/insights");
}
