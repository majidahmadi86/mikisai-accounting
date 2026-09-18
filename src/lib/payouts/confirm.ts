import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { proposeFifoMatch } from "@/lib/fifo";
import { round2 } from "@/lib/money";
import { allocatePayout } from "@/lib/payouts/partial";
import { num } from "@/lib/types";

export type PayoutMatchResult = { settlementIds: string[]; orders: number; amountReceived: number; allocated: number; clawbackOffset: number; previouslyLinked: string[] };

const CENT = 0.01;

/** Pending clawbacks on a platform: they come out of the next payout, so the orders it covers add up to the amount plus these. */
export async function pendingClawbacks(supabase: SupabaseClient, businessId: string, platform: string): Promise<{ ids: string[]; total: number }> {
  const { data } = await supabase.from("clawbacks").select("id, amount, transactions!inner(platform)").eq("business_id", businessId).eq("status", "pending").is("deleted_at", null).eq("transactions.platform", platform);
  return { ids: (data ?? []).map((c) => c.id as string), total: (data ?? []).reduce((a, c) => a + num(c.amount), 0) };
}

/**
 * Orders on a platform that still have money coming, oldest first. The amount
 * is what is left to pay: an order TikTok paid 70% of early is a candidate
 * again for its last 30%.
 */
export async function unpaidCandidates(supabase: SupabaseClient, businessId: string, platform: string) {
  const { data } = await supabase
    .from("settlements")
    .select("id, transaction_id, payout_id, status, paid_amount, transactions!inner(date, created_at, net_amount, platform, deleted_at, status, order_ref)")
    .eq("business_id", businessId)
    .eq("transactions.platform", platform)
    .is("deleted_at", null)
    .is("transactions.deleted_at", null)
    .in("status", ["pending", "settled_not_withdrawn"]);
  return (data ?? [])
    .map((s) => {
      const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
      const net = num(tx?.net_amount);
      return { settlement_id: s.id as string, transaction_id: s.transaction_id as string, order_ref: (tx?.order_ref as string | null) ?? null, order_status: (tx?.status as string | undefined) ?? "active", date: (tx?.date as string) ?? "", created_at: (tx?.created_at as string) ?? "", net_amount: round2(net - Math.min(net, num(s.paid_amount))) };
    })
    .filter((c) => c.net_amount > CENT && c.order_status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}

/** Takes back what this payout had paid: allocations where they exist, the single payout pointer for payouts matched before allocations existed. */
async function undoPayout(supabase: SupabaseClient, payoutId: string): Promise<string[]> {
  const touched: string[] = [];
  const { data: allocations } = await supabase.from("payout_allocations").select("id, settlement_id, amount").eq("payout_id", payoutId);
  for (const a of allocations ?? []) {
    const { data: s } = await supabase.from("settlements").select("id, paid_amount").eq("id", a.settlement_id).maybeSingle();
    if (!s) continue;
    const left = round2(Math.max(0, num(s.paid_amount) - num(a.amount)));
    const { data: other } = await supabase.from("payout_allocations").select("payout_id").eq("settlement_id", a.settlement_id).neq("payout_id", payoutId).limit(1);
    await supabase.from("settlements").update({ status: "pending", paid_amount: left, payout_id: other?.[0]?.payout_id ?? null, settled_at: left > 0 ? undefined : null }).eq("id", a.settlement_id);
    touched.push(a.settlement_id as string);
  }
  if (allocations?.length) await supabase.from("payout_allocations").delete().eq("payout_id", payoutId);
  const { data: legacy } = await supabase.from("settlements").select("id").eq("payout_id", payoutId).is("deleted_at", null);
  const legacyIds = (legacy ?? []).map((s) => s.id as string).filter((id) => !touched.includes(id));
  if (legacyIds.length) await supabase.from("settlements").update({ status: "pending", settled_at: null, payout_id: null, paid_amount: 0 }).in("id", legacyIds);
  return [...touched, ...legacyIds];
}

/** Writes what a payout pays per settlement: the running paid amount, the status once it is fully paid, and the allocation row that remembers which payout paid what. */
async function applyAllocations(supabase: SupabaseClient, businessId: string, payoutId: string, parts: { settlement_id: string; amount: number }[]): Promise<number> {
  const now = new Date().toISOString();
  let total = 0;
  for (const part of parts) {
    if (!(part.amount > 0)) continue;
    const { data: s } = await supabase.from("settlements").select("id, paid_amount, transactions!inner(net_amount)").eq("id", part.settlement_id).maybeSingle();
    if (!s) continue;
    const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
    const net = num(tx?.net_amount);
    const paid = round2(Math.min(net, num(s.paid_amount) + part.amount));
    const full = paid >= net - CENT;
    await supabase.from("settlements").update({ status: full ? "received_in_bank" : "pending", settled_at: now, payout_id: payoutId, paid_amount: full ? net : paid }).eq("id", part.settlement_id);
    await supabase.from("payout_allocations").insert({ business_id: businessId, payout_id: payoutId, settlement_id: part.settlement_id, amount: round2(part.amount) });
    total = round2(total + part.amount);
  }
  return total;
}

/**
 * Applies a payout match chosen by a person or by FIFO: the chosen orders are
 * paid oldest first with what each still has coming, the last one partially
 * when the money runs out. Re-confirming first takes back what this payout
 * had paid. Settlements deleted with their sale let go of the payout; pending
 * clawbacks on the platform are offset.
 */
export async function matchPayout(supabase: SupabaseClient, businessId: string, payoutId: string, settlementIds: string[]): Promise<PayoutMatchResult | null> {
  const { data: payout } = await supabase.from("payouts").select("id, platform, amount_received").eq("id", payoutId).eq("business_id", businessId).maybeSingle();
  if (!payout) return null;
  const ids = Array.from(new Set(settlementIds)).slice(0, 500);

  await supabase.from("settlements").update({ payout_id: null }).eq("payout_id", payoutId).not("deleted_at", "is", null);
  const previouslyLinked = await undoPayout(supabase, payoutId);

  const clawbacks = await pendingClawbacks(supabase, businessId, payout.platform as string);
  let eligibleIds: string[] = [];
  let allocated = 0;
  if (ids.length) {
    const { data: eligible } = await supabase
      .from("settlements")
      .select("id, paid_amount, status, transactions!inner(platform, date, created_at, net_amount)")
      .in("id", ids)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .eq("transactions.platform", payout.platform);
    const rows = (eligible ?? [])
      .map((s) => {
        const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
        const net = num(tx?.net_amount);
        return { settlement_id: s.id as string, date: (tx?.date as string) ?? "", created_at: (tx?.created_at as string) ?? "", net_amount: round2(net - Math.min(net, num(s.paid_amount))) };
      })
      .filter((r) => r.net_amount > CENT)
      .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    eligibleIds = rows.map((r) => r.settlement_id);
    const parts = allocatePayout(rows, num(payout.amount_received) + clawbacks.total).map((a) => ({ settlement_id: a.settlement_id, amount: a.paid }));
    allocated = await applyAllocations(supabase, businessId, payoutId, parts);
    if (clawbacks.ids.length) await supabase.from("clawbacks").update({ status: "offset", offset_payout_id: payoutId }).in("id", clawbacks.ids);
  }
  return { settlementIds: eligibleIds, orders: eligibleIds.length, amountReceived: num(payout.amount_received), allocated, clawbackOffset: clawbacks.total, previouslyLinked };
}

/**
 * Applies a payout whose source says exactly which orders it paid and how
 * much (a finance export, an API statement). No guessing: an order that is not
 * in the ledger, or has nothing left to pay, leaves that part of the payout
 * unallocated for a person to look at.
 */
export async function matchPayoutExact(supabase: SupabaseClient, businessId: string, payoutId: string, wanted: { order_ref: string; amount: number }[]): Promise<PayoutMatchResult | null> {
  const { data: payout } = await supabase.from("payouts").select("id, platform, amount_received").eq("id", payoutId).eq("business_id", businessId).maybeSingle();
  if (!payout) return null;
  const candidates = await unpaidCandidates(supabase, businessId, payout.platform as string);
  const byRef = new Map(candidates.filter((c) => c.order_ref).map((c) => [c.order_ref as string, c]));
  const parts: { settlement_id: string; amount: number }[] = [];
  for (const w of wanted) {
    const c = byRef.get(w.order_ref);
    if (!c) continue;
    parts.push({ settlement_id: c.settlement_id, amount: round2(Math.min(w.amount, c.net_amount)) });
  }
  const allocated = await applyAllocations(supabase, businessId, payoutId, parts);
  return { settlementIds: parts.map((p) => p.settlement_id), orders: parts.length, amountReceived: num(payout.amount_received), allocated, clawbackOffset: 0, previouslyLinked: [] };
}

/** FIFO proposal for a payout amount on a platform: the oldest orders with money still coming that add up to it (plus pending clawbacks). */
export async function proposeForAmount(supabase: SupabaseClient, businessId: string, platform: string, amount: number) {
  const [candidates, clawbacks] = await Promise.all([unpaidCandidates(supabase, businessId, platform), pendingClawbacks(supabase, businessId, platform)]);
  const proposal = proposeFifoMatch(candidates, amount + clawbacks.total);
  return { proposal, candidates, clawbackOffset: clawbacks.total };
}
