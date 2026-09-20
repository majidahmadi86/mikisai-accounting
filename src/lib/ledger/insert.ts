import "server-only";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { isOrderRefIssue, toRow, TransactionSchema, type ItemInput } from "./transaction-input";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockEffect } from "@/lib/categories";
import { SETTLEMENT_STATUSES, type SettlementStatus } from "@/lib/types";
import { reconcileLines } from "./reconcile";
import type { TransactionInput } from "./transaction-input";

export type DuplicateOrder = { id: string; date: string; net_amount: number };
export type SaveResult = { ok: true; id: string } | { ok: false; error: "invalid" | "order_ref" | "save" | "items" | "reconcile" | "unspecified" | "duplicate"; difference?: number; duplicate?: DuplicateOrder };

/** A live sale on the same platform with the same order number, if any. */
export async function findDuplicateOrder(supabase: SupabaseClient, businessId: string, platform: string, orderRef: string | null | undefined, excludeId?: string): Promise<DuplicateOrder | null> {
  const ref = orderRef?.trim();
  if (!ref) return null;
  let q = supabase.from("transactions").select("id, date, net_amount").eq("business_id", businessId).eq("type", "income").eq("platform", platform).eq("order_ref", ref).is("deleted_at", null).limit(2);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  const row = (data ?? [])[0];
  return row ? { id: row.id as string, date: row.date as string, net_amount: Number(row.net_amount) } : null;
}

/** Lines must add up to the row: qty x sale price to gross for a sale, qty x cost to the amount for a stock purchase. */
export function reconcileInput(input: TransactionInput, effect: StockEffect): { ok: boolean; difference: number } {
  const items = input.items ?? [];
  if (!items.length) return { ok: true, difference: 0 };
  if (input.type === "income") {
    const r = reconcileLines(items.map((i) => ({ qty: i.qty, price: i.unit_price ?? 0 })), input.gross_amount);
    return { ok: r.ok, difference: r.difference };
  }
  if (effect === "purchase") {
    const r = reconcileLines(items.map((i) => ({ qty: i.qty, price: i.unit_cost ?? 0 })), input.amount);
    return { ok: r.ok, difference: r.difference };
  }
  return { ok: true, difference: 0 };
}

/** Products named "Unspecified" are placeholders from the backfill; new rows must name a real product. */
export async function hasUnspecifiedProduct(supabase: SupabaseClient, items: ItemInput[]): Promise<boolean> {
  if (!items.length) return false;
  const { data } = await supabase.from("products").select("id, variant").in("id", items.map((i) => i.product_id));
  return (data ?? []).some((p) => p.variant === "Unspecified");
}

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
  if (!parsed.success) return { ok: false, error: isOrderRefIssue(parsed.error) ? "order_ref" : "invalid" };
  if (initialStatus !== undefined && !SETTLEMENT_STATUSES.includes(initialStatus)) return { ok: false, error: "invalid" };

  const { supabase, profile, userId } = await requireSession();
  const row = toRow(parsed.data, profile.business_id);
  if (parsed.data.type === "income") {
    const dup = await findDuplicateOrder(supabase, profile.business_id, parsed.data.platform, parsed.data.order_ref);
    if (dup) {
      const reason = parsed.data.override_reason?.trim();
      if (!reason || profile.role !== "admin") return { ok: false, error: "duplicate", duplicate: dup };
      row.note = [row.note, `Duplicate override: ${reason}`].filter(Boolean).join(" · ");
    }
  }
  const effect = parsed.data.type === "expense" ? await stockEffectFor(supabase, parsed.data.category_id) : "none";
  const items = parsed.data.items ?? [];
  if (parsed.data.type === "expense" && effect !== "none" && items.length === 0) return { ok: false, error: "items" };
  if (effect === "purchase" && items.some((i) => i.unit_cost == null)) return { ok: false, error: "items" };
  const rec = reconcileInput(parsed.data, effect);
  if (!rec.ok) return { ok: false, error: "reconcile", difference: rec.difference };
  if (await hasUnspecifiedProduct(supabase, items)) return { ok: false, error: "unspecified" };

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
      .insert({ business_id: profile.business_id, transaction_id: data.id, status, settled_at: status === "received_in_bank" ? new Date().toISOString() : null, paid_amount: status === "received_in_bank" ? row.net_amount : 0 });
    if (sErr) {
      await supabase.from("transactions").delete().eq("id", data.id);
      return { ok: false, error: "save" };
    }
  }

  ledgerChanged(profile.business_id);
  return { ok: true, id: data.id };
}
