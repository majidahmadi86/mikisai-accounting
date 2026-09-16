"use server";

import { redirect } from "next/navigation";
import { recordDenied, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { insertTransaction, type SaveResult } from "@/lib/ledger/insert";
import { formToObject, toRow, TransactionSchema } from "@/lib/ledger/transaction-input";

export async function createTransaction(formData: FormData) {
  const parsed = TransactionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/transactions/new?type=${formData.get("type") ?? "income"}&error=invalid`);
  const result = await insertTransaction(parsed.data);
  if (!result.ok) redirect(`/transactions/new?type=${parsed.data.type}&error=${result.error}`);
  redirect("/transactions?saved=1");
}

/** Quick-entry sheet: validates the client payload and inserts without a redirect. */
export async function quickAddTransaction(input: unknown): Promise<SaveResult> {
  return insertTransaction(input);
}

export async function updateTransaction(id: string, formData: FormData) {
  const session = await requireSession();
  const { supabase, profile } = session;
  const parsed = TransactionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/transactions/${id}/edit?error=invalid`);

  const row = toRow(parsed.data, profile.business_id);
  const { error, count } = await supabase.from("transactions").update(row, { count: "exact" }).eq("id", id).eq("business_id", profile.business_id).is("deleted_at", null);
  if (error) redirect(`/transactions/${id}/edit?error=save`);
  if (!count) {
    // RLS refused: not the admin, not the author, or older than 24 hours.
    await recordDenied(session, "transaction", id, { attempted: "update" });
    redirect(`/transactions/${id}/edit?error=denied`);
  }

  if (parsed.data.type === "income" && parsed.data.settlement_status) {
    const status = parsed.data.settlement_status;
    const { data: existing } = await supabase.from("settlements").select("id, status").eq("transaction_id", id).maybeSingle();
    if (existing) {
      if (existing.status !== status) {
        await supabase
          .from("settlements")
          .update({ status, settled_at: status === "received_in_bank" ? new Date().toISOString() : null, payout_id: status === "received_in_bank" ? undefined : null })
          .eq("id", existing.id);
      }
    } else {
      await supabase.from("settlements").insert({ business_id: profile.business_id, transaction_id: id, status });
    }
  }

  ledgerChanged(profile.business_id);
  redirect("/transactions?saved=1");
}

/**
 * Soft-deletes a transaction. Used by the quick-entry undo toast: RLS lets a
 * contributor do this only for their own row within 24 hours, which is exactly
 * the undo case; anything else is refused and recorded.
 */
export async function removeTransaction(id: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const { supabase, profile, userId } = session;
  const { error, count } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId }, { count: "exact" })
    .eq("id", id)
    .eq("business_id", profile.business_id)
    .is("deleted_at", null);
  if (error || !count) {
    await recordDenied(session, "transaction", id, { attempted: "soft_delete" });
    return { ok: false };
  }
  ledgerChanged(profile.business_id);
  return { ok: true };
}
