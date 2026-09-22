"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot, ledgerChanged } from "@/lib/data/ledger";
import { todayIso } from "@/lib/money";
import { kindForReason } from "@/lib/types";
import { weekOf } from "@/lib/week";
import { weekFromSnapshot } from "@/lib/week-view";

/**
 * Mark as sent on This week: records the one net transfer, today, for the
 * amount and direction the page shows and with the reason worked out from
 * the same numbers. Recomputed here, so nothing the browser sends can change
 * who pays whom or how much.
 */
export async function markWeekSent(formData: FormData): Promise<void> {
  const { supabase, profile } = await requireSession();
  const from = formData.get("from");
  const today = todayIso();
  const period = weekOf(typeof from === "string" ? from : null, today);
  const back = `/week?from=${period.from}`;
  const w = weekFromSnapshot(await getLedgerSnapshot(profile.business_id), period, today);
  const owes = w.cash.owes;
  if (!owes) redirect(`${back}&sent=even`);
  const { error } = await supabase.from("internal_transfers").insert({
    business_id: profile.business_id,
    date: today,
    from_person: owes.from,
    to_person: owes.to,
    amount: owes.amount,
    reason: w.cash.reason,
    kind: kindForReason(w.cash.reason),
    note: `This week ${period.from} to ${period.to}: the one net transfer`,
  });
  if (error) redirect(`${back}&sent=error`);
  ledgerChanged(profile.business_id);
  redirect(`${back}&sent=1`);
}
