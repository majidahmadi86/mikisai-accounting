"use server";

import { redirect } from "next/navigation";
import { recordDenied, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { findDuplicateOrder, hasUnspecifiedProduct, insertTransaction, reconcileInput, stockEffectFor, type SaveResult } from "@/lib/ledger/insert";
import { applyTransactionUpdate } from "@/lib/ledger/update";
import { formToObject, toRow, TransactionSchema } from "@/lib/ledger/transaction-input";

export async function createTransaction(formData: FormData) {
  const parsed = TransactionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/transactions/new?type=${formData.get("type") ?? "income"}&error=invalid`);
  const result = await insertTransaction(parsed.data);
  if (!result.ok) redirect(`/transactions/new?type=${parsed.data.type}&error=${result.error === "reconcile" ? `reconcile:${result.difference ?? 0}` : result.error === "duplicate" ? `duplicate:${result.duplicate?.date ?? ""}:${result.duplicate?.net_amount ?? 0}` : result.error}`);
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
  const effect = parsed.data.type === "expense" ? await stockEffectFor(supabase, parsed.data.category_id) : "none";
  const items = parsed.data.items ?? [];
  if (parsed.data.type === "expense" && effect !== "none" && items.length === 0) redirect(`/transactions/${id}/edit?error=items`);
  const rec = reconcileInput(parsed.data, effect);
  if (!rec.ok) redirect(`/transactions/${id}/edit?error=reconcile:${rec.difference}`);
  if (await hasUnspecifiedProduct(supabase, items)) redirect(`/transactions/${id}/edit?error=unspecified`);
  if (parsed.data.type === "income") {
    const dup = await findDuplicateOrder(supabase, profile.business_id, parsed.data.platform, parsed.data.order_ref, id);
    if (dup) {
      const reason = parsed.data.override_reason?.trim();
      if (!reason || profile.role !== "admin") redirect(`/transactions/${id}/edit?error=duplicate:${dup.date}:${dup.net_amount}`);
      row.note = [row.note, `Duplicate override: ${reason}`].filter(Boolean).join(" · ");
    }
  }
  const outcome = await applyTransactionUpdate(supabase, profile.business_id, id, row, parsed.data.type === "income" ? parsed.data.settlement_status : undefined, { list: items, effect });
  if (!outcome.ok) {
    if (outcome.reason === "denied") {
      // RLS refused: not the admin, not the author, or older than 24 hours.
      await recordDenied(session, "transaction", id, { attempted: "update" });
      redirect(`/transactions/${id}/edit?error=denied`);
    }
    redirect(`/transactions/${id}/edit?error=save`);
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
