"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
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
  const { supabase, profile } = await requireSession();
  const parsed = TransactionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/transactions/${id}/edit?error=invalid`);

  const row = toRow(parsed.data, profile.business_id);
  const { error } = await supabase.from("transactions").update(row).eq("id", id).eq("business_id", profile.business_id);
  if (error) redirect(`/transactions/${id}/edit?error=save`);

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

/** Removes a transaction (its settlement cascades). Also used by the quick-entry undo toast. */
export async function removeTransaction(id: string): Promise<{ ok: boolean }> {
  const { supabase, profile } = await requireSession();
  const { error, count } = await supabase.from("transactions").delete({ count: "exact" }).eq("id", id).eq("business_id", profile.business_id);
  if (error || !count) return { ok: false };
  ledgerChanged(profile.business_id);
  return { ok: true };
}

export async function deleteTransaction(id: string) {
  await removeTransaction(id);
  redirect("/transactions");
}
