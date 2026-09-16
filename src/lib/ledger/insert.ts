import "server-only";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { toRow, TransactionSchema } from "./transaction-input";
import { SETTLEMENT_STATUSES, type SettlementStatus } from "@/lib/types";

export type SaveResult = { ok: true; id: string } | { ok: false; error: "invalid" | "save" };

/**
 * Validates and inserts a transaction (plus a pending settlement for income),
 * then expires the ledger cache. Not a server action: callers in action files
 * wrap it, so this cannot be invoked from the network with unchecked input.
 */
export async function insertTransaction(input: unknown, initialStatus?: SettlementStatus): Promise<SaveResult> {
  const parsed = TransactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (initialStatus !== undefined && !SETTLEMENT_STATUSES.includes(initialStatus)) return { ok: false, error: "invalid" };

  const { supabase, profile } = await requireSession();
  const row = toRow(parsed.data, profile.business_id);
  const { data, error } = await supabase.from("transactions").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: "save" };

  if (row.type === "income") {
    const status = initialStatus ?? "pending";
    const { error: sErr } = await supabase
      .from("settlements")
      .insert({ business_id: profile.business_id, transaction_id: data.id, status, settled_at: status === "received_in_bank" ? new Date().toISOString() : null });
    if (sErr) {
      await supabase.from("transactions").delete().eq("id", data.id);
      return { ok: false, error: "save" };
    }
  }

  ledgerChanged(profile.business_id);
  return { ok: true, id: data.id };
}
