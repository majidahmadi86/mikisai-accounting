import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemInput, TransactionInsert } from "./transaction-input";
import { writeItems } from "./insert";
import type { StockEffect } from "@/lib/categories";
import type { Person, Platform, SettlementStatus, TransferKind, TransferReason } from "@/lib/types";

/**
 * The one update path for ledger rows, shared by the server actions and the
 * integration test. Runs through the caller's RLS client, so who may edit
 * what is decided by Postgres; a refusal comes back as `denied` (zero rows).
 * The audit trigger records before/after for every successful update.
 */
export type UpdateOutcome = { ok: true } | { ok: false; reason: "denied" | "error"; message?: string };

export async function applyTransactionUpdate(
  supabase: SupabaseClient,
  businessId: string,
  id: string,
  row: TransactionInsert,
  settlementStatus?: SettlementStatus,
  items?: { list: ItemInput[]; effect: StockEffect },
): Promise<UpdateOutcome> {
  const { error, count } = await supabase.from("transactions").update(row, { count: "exact" }).eq("id", id).eq("business_id", businessId).is("deleted_at", null);
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!count) return { ok: false, reason: "denied" };
  if (items) {
    const ok = await writeItems(supabase, id, items.list, items.effect);
    if (!ok) return { ok: false, reason: "error", message: "items" };
  }

  if (row.type === "income" && settlementStatus) {
    const { data: existing } = await supabase.from("settlements").select("id, status").eq("transaction_id", id).maybeSingle();
    if (existing) {
      if (existing.status !== settlementStatus) {
        await supabase
          .from("settlements")
          .update({ status: settlementStatus, settled_at: settlementStatus === "received_in_bank" ? new Date().toISOString() : null, payout_id: settlementStatus === "received_in_bank" ? undefined : null })
          .eq("id", existing.id);
      }
    } else {
      await supabase.from("settlements").insert({ business_id: businessId, transaction_id: id, status: settlementStatus });
    }
  }
  return { ok: true };
}

export type PayoutPatch = { date: string; platform: Platform; amount_received: number; received_by: Person; note: string };

export async function applyPayoutUpdate(supabase: SupabaseClient, businessId: string, id: string, patch: PayoutPatch): Promise<UpdateOutcome> {
  const { error, count } = await supabase.from("payouts").update(patch, { count: "exact" }).eq("id", id).eq("business_id", businessId).is("deleted_at", null);
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!count) return { ok: false, reason: "denied" };
  return { ok: true };
}

export type TransferPatch = { date: string; from_person: Person; to_person: Person; amount: number; kind: TransferKind; reason: TransferReason; note: string };

export async function applyTransferUpdate(supabase: SupabaseClient, businessId: string, id: string, patch: TransferPatch): Promise<UpdateOutcome> {
  const { error, count } = await supabase.from("internal_transfers").update(patch, { count: "exact" }).eq("id", id).eq("business_id", businessId).is("deleted_at", null);
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!count) return { ok: false, reason: "denied" };
  return { ok: true };
}
