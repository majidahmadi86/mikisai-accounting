"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { PEOPLE, PLATFORMS } from "@/lib/types";

const PayoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  amount_received: z.coerce.number().positive().max(99_999_999),
  received_by: z.enum(PEOPLE),
  note: z.string().trim().max(2000).optional(),
});

export async function createPayout(formData: FormData) {
  const session = await requireSession();
  const { supabase, profile } = session;
  const parsed = PayoutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/payouts/new?error=invalid");

  const { data, error } = await supabase
    .from("payouts")
    .insert({ business_id: profile.business_id, ...parsed.data, note: parsed.data.note ?? "" })
    .select("*")
    .single();
  if (error || !data) redirect("/payouts/new?error=save");

  await recordAudit(session, { action: "create", entity_type: "payout", entity_id: data.id, after: data });
  ledgerChanged(profile.business_id);
  redirect(`/payouts/${data.id}/reconcile`);
}

/**
 * Applies the user's confirmed match: the chosen settlements become
 * received_in_bank and point at this payout. Anything previously linked to
 * the payout but now unticked goes back to pending and is carried forward.
 */
export async function confirmPayoutMatch(payoutId: string, settlementIds: string[]) {
  const session = await requireSession();
  const { supabase, profile } = session;
  const ids = Array.from(new Set(settlementIds.filter((id) => typeof id === "string" && id.length > 0)));

  const { data: payout } = await supabase.from("payouts").select("id, platform, amount_received").eq("id", payoutId).eq("business_id", profile.business_id).maybeSingle();
  if (!payout) redirect("/payouts");

  const { data: linked } = await supabase.from("settlements").select("id").eq("payout_id", payoutId);
  const previouslyLinked = (linked ?? []).map((s) => s.id);
  const toUnlink = previouslyLinked.filter((id) => !ids.includes(id));
  if (toUnlink.length) {
    await supabase.from("settlements").update({ status: "pending", settled_at: null, payout_id: null }).in("id", toUnlink);
  }

  let eligibleIds: string[] = [];
  if (ids.length) {
    // Only settlements on the payout's platform that are not already claimed by another payout.
    const { data: eligible } = await supabase
      .from("settlements")
      .select("id, payout_id, transactions!inner(platform)")
      .in("id", ids)
      .eq("transactions.platform", payout.platform);
    eligibleIds = (eligible ?? []).filter((s) => !s.payout_id || s.payout_id === payoutId).map((s) => s.id);
    if (eligibleIds.length) {
      await supabase
        .from("settlements")
        .update({ status: "received_in_bank", settled_at: new Date().toISOString(), payout_id: payoutId })
        .in("id", eligibleIds);
    }
  }

  await recordAudit(session, {
    action: "confirm_payout",
    entity_type: "payout",
    entity_id: payoutId,
    before: { settlement_ids: previouslyLinked },
    after: { settlement_ids: eligibleIds, orders: eligibleIds.length, amount_received: payout.amount_received },
  });
  ledgerChanged(profile.business_id);
  redirect("/payouts?matched=1");
}

export async function deletePayout(id: string) {
  const session = await requireSession();
  const { supabase, profile } = session;
  const { data: before } = await supabase.from("payouts").select("*").eq("id", id).eq("business_id", profile.business_id).maybeSingle();
  if (!before) redirect("/payouts");
  const { data: linked } = await supabase.from("settlements").select("id").eq("payout_id", id);
  // Return matched orders to pending before removing the payout.
  await supabase.from("settlements").update({ status: "pending", settled_at: null, payout_id: null }).eq("payout_id", id);
  await supabase.from("payouts").delete().eq("id", id).eq("business_id", profile.business_id);
  await recordAudit(session, { action: "delete", entity_type: "payout", entity_id: id, before: { ...before, settlement_ids: (linked ?? []).map((s) => s.id) } });
  ledgerChanged(profile.business_id);
  redirect("/payouts");
}
