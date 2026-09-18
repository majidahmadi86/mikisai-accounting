"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { recordDenied, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { applyPayoutUpdate } from "@/lib/ledger/update";
import { PEOPLE, PLATFORMS } from "@/lib/types";
import { allocatePayout } from "@/lib/payouts/partial";
import { num } from "@/lib/types";

const PayoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  amount_received: z.coerce.number().positive().max(99_999_999),
  received_by: z.enum(PEOPLE),
  note: z.string().trim().max(2000).optional(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createPayout(formData: FormData) {
  const { supabase, profile } = await requireSession();
  const parsed = PayoutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/payouts/new?error=invalid");

  const { data, error } = await supabase
    .from("payouts")
    .insert({ business_id: profile.business_id, ...parsed.data, note: parsed.data.note ?? "" })
    .select("id")
    .single();
  if (error || !data) redirect("/payouts/new?error=save");

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
  if (!UUID.test(payoutId)) redirect("/payouts");
  const ids = Array.from(new Set((Array.isArray(settlementIds) ? settlementIds : []).filter((id) => typeof id === "string" && UUID.test(id)))).slice(0, 500);

  const { data: payout } = await supabase.from("payouts").select("id, platform, amount_received").eq("id", payoutId).eq("business_id", profile.business_id).maybeSingle();
  if (!payout) redirect("/payouts");

  // Settlements deleted with their sale still point here until this re-confirm; let them go.
  await supabase.from("settlements").update({ payout_id: null }).eq("payout_id", payoutId).not("deleted_at", "is", null);
  const { data: linked } = await supabase.from("settlements").select("id").eq("payout_id", payoutId).is("deleted_at", null);
  const previouslyLinked = (linked ?? []).map((s) => s.id);
  const toUnlink = previouslyLinked.filter((id) => !ids.includes(id));
  if (toUnlink.length) {
    await supabase.from("settlements").update({ status: "pending", settled_at: null, payout_id: null, paid_amount: 0 }).in("id", toUnlink);
  }

  let eligibleIds: string[] = [];
  if (ids.length) {
    // Only settlements on the payout's platform that are not already claimed by another payout.
    const { data: eligible } = await supabase
      .from("settlements")
      .select("id, payout_id, transactions!inner(platform, date, created_at, net_amount)")
      .in("id", ids)
      .is("deleted_at", null)
      .eq("transactions.platform", payout.platform);
    const rows = (eligible ?? [])
      .filter((s) => !s.payout_id || s.payout_id === payoutId)
      .map((s) => {
        const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
        return { settlement_id: s.id as string, date: tx?.date ?? "", created_at: tx?.created_at ?? "", net_amount: num(tx?.net_amount) };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    eligibleIds = rows.map((r) => r.settlement_id);
    // Oldest orders first; the payout covers what it covers, the rest stays pending on its own (70/30 early payouts).
    const now = new Date().toISOString();
    for (const a of allocatePayout(rows, num(payout.amount_received))) {
      await supabase
        .from("settlements")
        .update(a.full ? { status: "received_in_bank", settled_at: now, payout_id: payoutId, paid_amount: a.paid } : { status: "pending", settled_at: a.paid > 0 ? now : null, payout_id: a.paid > 0 ? payoutId : null, paid_amount: a.paid })
        .eq("id", a.settlement_id);
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


export async function updatePayout(id: string, formData: FormData) {
  const session = await requireSession();
  const { supabase, profile } = session;
  if (!UUID.test(id)) redirect("/payouts");
  const parsed = PayoutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/payouts/${id}/edit?error=invalid`);

  const outcome = await applyPayoutUpdate(supabase, profile.business_id, id, { ...parsed.data, note: parsed.data.note ?? "" });
  if (!outcome.ok) {
    if (outcome.reason === "denied") {
      await recordDenied(session, "payout", id, { attempted: "update" });
      redirect(`/payouts/${id}/edit?error=denied`);
    }
    redirect(`/payouts/${id}/edit?error=save`);
  }
  ledgerChanged(profile.business_id);
  redirect("/payouts?saved=1");
}
