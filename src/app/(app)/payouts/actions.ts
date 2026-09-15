"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { PEOPLE, PLATFORMS } from "@/lib/types";

const PayoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  amount_received: z.coerce.number().positive().max(99_999_999),
  received_by: z.enum(PEOPLE),
  note: z.string().trim().max(2000).optional(),
});

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/payouts");
  revalidatePath("/transactions");
}

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

  revalidateAll();
  redirect(`/payouts/${data.id}/reconcile`);
}

/**
 * Applies the user's confirmed match: the chosen settlements become
 * received_in_bank and point at this payout. Anything previously linked to
 * the payout but now unticked goes back to pending and is carried forward.
 */
export async function confirmPayoutMatch(payoutId: string, settlementIds: string[]) {
  const { supabase, profile } = await requireSession();
  const ids = Array.from(new Set(settlementIds.filter((id) => typeof id === "string" && id.length > 0)));

  const { data: payout } = await supabase.from("payouts").select("id, platform").eq("id", payoutId).eq("business_id", profile.business_id).maybeSingle();
  if (!payout) redirect("/payouts");

  const { data: linked } = await supabase.from("settlements").select("id").eq("payout_id", payoutId);
  const toUnlink = (linked ?? []).map((s) => s.id).filter((id) => !ids.includes(id));
  if (toUnlink.length) {
    await supabase.from("settlements").update({ status: "pending", settled_at: null, payout_id: null }).in("id", toUnlink);
  }

  if (ids.length) {
    // Only settlements on the payout's platform that are not already claimed by another payout.
    const { data: eligible } = await supabase
      .from("settlements")
      .select("id, payout_id, transactions!inner(platform)")
      .in("id", ids)
      .eq("transactions.platform", payout.platform);
    const eligibleIds = (eligible ?? []).filter((s) => !s.payout_id || s.payout_id === payoutId).map((s) => s.id);
    if (eligibleIds.length) {
      await supabase
        .from("settlements")
        .update({ status: "received_in_bank", settled_at: new Date().toISOString(), payout_id: payoutId })
        .in("id", eligibleIds);
    }
  }

  revalidateAll();
  redirect("/payouts?matched=1");
}

export async function deletePayout(id: string) {
  const { supabase, profile } = await requireSession();
  // Return matched orders to pending before removing the payout.
  await supabase.from("settlements").update({ status: "pending", settled_at: null, payout_id: null }).eq("payout_id", id);
  await supabase.from("payouts").delete().eq("id", id).eq("business_id", profile.business_id);
  revalidateAll();
  redirect("/payouts");
}
