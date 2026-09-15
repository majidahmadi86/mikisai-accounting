"use server";

import { redirect } from "next/navigation";
import { auditDiff, recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { formToObject, toRow, TransactionSchema, type TransactionInput } from "@/lib/ledger/transaction-input";
import type { SettlementStatus } from "@/lib/types";

export type SaveResult = { ok: true; id: string } | { ok: false; error: "invalid" | "save" };

/**
 * Inserts a transaction (plus a pending settlement for income), writes the
 * audit row and expires the ledger cache. Shared by the full form and the
 * quick-entry sheet.
 */
export async function insertTransaction(input: TransactionInput, initialStatus?: SettlementStatus): Promise<SaveResult> {
  const session = await requireSession();
  const { supabase, profile } = session;
  const row = toRow(input, profile.business_id);
  const { data, error } = await supabase.from("transactions").insert(row).select("*").single();
  if (error || !data) return { ok: false, error: "save" };

  let settlement: Record<string, unknown> | null = null;
  if (row.type === "income") {
    const status = initialStatus ?? "pending";
    const { data: s, error: sErr } = await supabase
      .from("settlements")
      .insert({ business_id: profile.business_id, transaction_id: data.id, status, settled_at: status === "received_in_bank" ? new Date().toISOString() : null })
      .select("*")
      .single();
    if (sErr) {
      await supabase.from("transactions").delete().eq("id", data.id);
      return { ok: false, error: "save" };
    }
    settlement = s;
  }

  await recordAudit(session, { action: "create", entity_type: "transaction", entity_id: data.id, after: { ...data, settlement_status: settlement?.status ?? null } });
  ledgerChanged(profile.business_id);
  return { ok: true, id: data.id };
}

export async function createTransaction(formData: FormData) {
  const parsed = TransactionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/transactions/new?type=${formData.get("type") ?? "income"}&error=invalid`);
  const result = await insertTransaction(parsed.data);
  if (!result.ok) redirect(`/transactions/new?type=${parsed.data.type}&error=${result.error}`);
  redirect("/transactions?saved=1");
}

export async function updateTransaction(id: string, formData: FormData) {
  const session = await requireSession();
  const { supabase, profile } = session;
  const parsed = TransactionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/transactions/${id}/edit?error=invalid`);

  const { data: before } = await supabase.from("transactions").select("*, settlements(status)").eq("id", id).eq("business_id", profile.business_id).maybeSingle();
  if (!before) redirect("/transactions");
  const beforeSettlement = Array.isArray(before.settlements) ? before.settlements[0] : before.settlements;

  const row = toRow(parsed.data, profile.business_id);
  const { data: after, error } = await supabase.from("transactions").update(row).eq("id", id).eq("business_id", profile.business_id).select("*").single();
  if (error || !after) redirect(`/transactions/${id}/edit?error=save`);

  let afterStatus: string | null = beforeSettlement?.status ?? null;
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
    afterStatus = status;
  }

  const { settlements: _b, ...beforeRow } = before;
  void _b;
  const diff = auditDiff({ ...beforeRow, settlement_status: beforeSettlement?.status ?? null }, { ...after, settlement_status: afterStatus });
  await recordAudit(session, { action: "update", entity_type: "transaction", entity_id: id, before: diff.before, after: diff.after });
  ledgerChanged(profile.business_id);
  redirect("/transactions?saved=1");
}

/** Removes a transaction (settlement cascades). Returns the deleted row so callers can offer undo. */
export async function removeTransaction(id: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const { supabase, profile } = session;
  const { data: before } = await supabase.from("transactions").select("*, settlements(status)").eq("id", id).eq("business_id", profile.business_id).maybeSingle();
  if (!before) return { ok: false };
  const s = Array.isArray(before.settlements) ? before.settlements[0] : before.settlements;
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("business_id", profile.business_id);
  if (error) return { ok: false };
  const { settlements: _s, ...row } = before;
  void _s;
  await recordAudit(session, { action: "delete", entity_type: "transaction", entity_id: id, before: { ...row, settlement_status: s?.status ?? null } });
  ledgerChanged(profile.business_id);
  return { ok: true };
}

export async function deleteTransaction(id: string) {
  await removeTransaction(id);
  redirect("/transactions");
}
