"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireSession } from "@/lib/auth";
import { ledgerTag } from "@/lib/data/ledger";
import { insightsTag } from "@/lib/insights/narrative";

const MIN_INTERVAL_MS = 60_000;
const lastRefresh = new Map<string, number>();

/**
 * "Refresh now": drops the cached snapshot and narrative for this business.
 * Throttled per business so the button cannot be used to burn the Gemini quota.
 */
export async function refreshInsights(): Promise<{ ok: boolean; waitSeconds?: number }> {
  const { profile } = await requireSession();
  const now = Date.now();
  const last = lastRefresh.get(profile.business_id) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return { ok: false, waitSeconds: Math.ceil((MIN_INTERVAL_MS - (now - last)) / 1000) };
  lastRefresh.set(profile.business_id, now);
  updateTag(ledgerTag(profile.business_id));
  updateTag(insightsTag(profile.business_id));
  revalidatePath("/insights");
  return { ok: true };
}
