import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { proposeFifoMatch } from "@/lib/fifo";
import { allocatePayout } from "@/lib/payouts/partial";
import { num } from "@/lib/types";

export type PayoutMatchResult = { settlementIds: string[]; orders: number; amountReceived: number; clawbackOffset: number; previouslyLinked: string[] };

/** Pending clawbacks on a platform: they come out of the next payout, so the orders it covers add up to the amount plus these. */
export async function pendingClawbacks(supabase: SupabaseClient, businessId: string, platform: string): Promise<{ ids: string[]; total: number }> {
  const { data } = await supabase.from("clawbacks").select("id, amount, transactions!inner(platform)").eq("business_id", businessId).eq("status", "pending").is("deleted_at", null).eq("transactions.platform", platform);
  return { ids: (data ?? []).map((c) => c.id as string), total: (data ?? []).reduce((a, c) => a + num(c.amount), 0) };
}

/** Unpaid orders on a platform, oldest first, in the shape the FIFO matcher wants. */
export async function unpaidCandidates(supabase: SupabaseClient, businessId: string, platform: string, payoutId?: string) {
  let q = supabase
    .from("settlements")
    .select("id, transaction_id, payout_id, status, transactions!inner(date, created_at, net_amount, platform, deleted_at)")
    .eq("business_id", businessId)
    .eq("transactions.platform", platform)
    .is("deleted_at", null)
    .is("transactions.deleted_at", null);
  q = payoutId ? q.or(`payout_id.eq.${payoutId},and(payout_id.is.null,status.in.(pending,settled_not_withdrawn))`) : q.is("payout_id", null).in("status", ["pending", "settled_not_withdrawn"]);
  const { data } = await q;
  return (data ?? [])
    .map((s) => {
      const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
      return { settlement_id: s.id as string, transaction_id: s.transaction_id as string, date: (tx?.date as string) ?? "", created_at: (tx?.created_at as string) ?? "", net_amount: num(tx?.net_amount) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}

/**
 * Applies a payout match: the chosen settlements become received in bank
 * (oldest first, the last one partially when the money runs out) and point at
 * the payout; anything previously linked but not chosen goes back to pending;
 * settlements deleted with their sale let go of the payout; pending clawbacks
 * on the platform are offset. Shared by the reconcile page and the imports.
 */
export async function matchPayout(supabase: SupabaseClient, businessId: string, payoutId: string, settlementIds: string[]): Promise<PayoutMatchResult | null> {
  const { data: payout } = await supabase.from("payouts").select("id, platform, amount_received").eq("id", payoutId).eq("business_id", businessId).maybeSingle();
  if (!payout) return null;
  const ids = Array.from(new Set(settlementIds)).slice(0, 500);

  await supabase.from("settlements").update({ payout_id: null }).eq("payout_id", payoutId).not("deleted_at", "is", null);
  const { data: linked } = await supabase.from("settlements").select("id").eq("payout_id", payoutId).is("deleted_at", null);
  const previouslyLinked = (linked ?? []).map((s) => s.id as string);
  const toUnlink = previouslyLinked.filter((id) => !ids.includes(id));
  if (toUnlink.length) await supabase.from("settlements").update({ status: "pending", settled_at: null, payout_id: null, paid_amount: 0 }).in("id", toUnlink);

  const clawbacks = await pendingClawbacks(supabase, businessId, payout.platform as string);
  let eligibleIds: string[] = [];
  if (ids.length) {
    const { data: eligible } = await supabase
      .from("settlements")
      .select("id, payout_id, transactions!inner(platform, date, created_at, net_amount)")
      .in("id", ids)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .eq("transactions.platform", payout.platform);
    const rows = (eligible ?? [])
      .filter((s) => !s.payout_id || s.payout_id === payoutId)
      .map((s) => {
        const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
        return { settlement_id: s.id as string, date: (tx?.date as string) ?? "", created_at: (tx?.created_at as string) ?? "", net_amount: num(tx?.net_amount) };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    eligibleIds = rows.map((r) => r.settlement_id);
    const now = new Date().toISOString();
    for (const a of allocatePayout(rows, num(payout.amount_received) + clawbacks.total)) {
      await supabase
        .from("settlements")
        .update(a.full ? { status: "received_in_bank", settled_at: now, payout_id: payoutId, paid_amount: a.paid } : { status: "pending", settled_at: a.paid > 0 ? now : null, payout_id: a.paid > 0 ? payoutId : null, paid_amount: a.paid })
        .eq("id", a.settlement_id);
    }
    if (clawbacks.ids.length) await supabase.from("clawbacks").update({ status: "offset", offset_payout_id: payoutId }).in("id", clawbacks.ids);
  }
  return { settlementIds: eligibleIds, orders: eligibleIds.length, amountReceived: num(payout.amount_received), clawbackOffset: clawbacks.total, previouslyLinked };
}

/** FIFO proposal for a payout amount on a platform: the oldest unpaid orders that add up to it (plus pending clawbacks). */
export async function proposeForAmount(supabase: SupabaseClient, businessId: string, platform: string, amount: number) {
  const [candidates, clawbacks] = await Promise.all([unpaidCandidates(supabase, businessId, platform), pendingClawbacks(supabase, businessId, platform)]);
  const proposal = proposeFifoMatch(candidates, amount + clawbacks.total);
  return { proposal, candidates, clawbackOffset: clawbacks.total };
}
