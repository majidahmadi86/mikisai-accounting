"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { recordDenied, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { applyPayoutUpdate } from "@/lib/ledger/update";
import { PEOPLE, PLATFORMS } from "@/lib/types";
import { matchPayout } from "@/lib/payouts/confirm";

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
  const ids = (Array.isArray(settlementIds) ? settlementIds : []).filter((id) => typeof id === "string" && UUID.test(id));
  const result = await matchPayout(supabase, profile.business_id, payoutId, ids);
  if (!result) redirect("/payouts");
  await recordAudit(session, {
    action: "confirm_payout",
    entity_type: "payout",
    entity_id: payoutId,
    before: { settlement_ids: result.previouslyLinked },
    after: { settlement_ids: result.settlementIds, orders: result.orders, amount_received: result.amountReceived, clawbacks_offset: result.clawbackOffset },
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
