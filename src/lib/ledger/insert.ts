import "server-only";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { toRow, TransactionSchema, type ItemInput } from "./transaction-input";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockEffect } from "@/lib/categories";
import { SETTLEMENT_STATUSES, type SettlementStatus } from "@/lib/types";

export type SaveResult = { ok: true; id: string } | { ok: false; error: "invalid" | "save" | "items" };

/** How an expense category moves stock; "none" for income or unknown categories. */
export async function stockEffectFor(supabase: SupabaseClient, categoryId: string | null | undefined): Promise<StockEffect> {
  if (!categoryId) return "none";
  const { data } = await supabase.from("expense_categories").select("stock_effect").eq("id", categoryId).maybeSingle();
  return (data?.stock_effect as StockEffect | undefined) ?? "none";
}

/** Writes the transaction's product lines and the stock movements they imply (security-definer RPC, same role rule as editing the row). */
export async function writeItems(supabase: SupabaseClient, transactionId: string, items: ItemInput[], effect: StockEffect): Promise<boolean> {
  const { error } = await supabase.rpc("replace_transaction_items", { p_transaction_id: transactionId, p_items: items, p_effect: effect });
  if (error) console.error("[items] replace failed", transactionId, error.message);
  return !error;
}

/**
 * Validates and inserts a transaction (plus a pending settlement for income),
 * then expires the ledger cache. Not a server action: callers in action files
 * wrap it, so this cannot be invoked from the network with unchecked input.
 */
export async function insertTransaction(input: unknown, initialStatus?: SettlementStatus): Promise<SaveResult> {
  const parsed = TransactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (initialStatus !== undefined && !SETTLEMENT_STATUSES.includes(initialStatus)) return { ok: false, error: "invalid" };

  const { supabase, profile, userId } = await requireSession();
  const row = toRow(parsed.data, profile.business_id);
  const effect = parsed.data.type === "expense" ? await stockEffectFor(supabase, parsed.data.category_id) : "none";
  const items = parsed.data.items ?? [];
  if (parsed.data.type === "expense" && effect !== "none" && items.length === 0) return { ok: false, error: "items" };
  if (effect === "purchase" && items.some((i) => i.unit_cost == null)) return { ok: false, error: "items" };

  const { data, error } = await supabase.from("transactions").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: "save" };

  if (items.length) {
    const ok = await writeItems(supabase, data.id, items, effect);
    if (!ok) {
      // Cannot hard-delete: hide the half-saved row instead so the ledger stays clean.
      await supabase.from("transactions").update({ deleted_at: new Date().toISOString(), deleted_by: userId }).eq("id", data.id);
      return { ok: false, error: "items" };
    }
  }

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
