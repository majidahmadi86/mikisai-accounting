import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/types";

export type OrderStatusPatch = { status: OrderStatus; date: string; reason: string; refund_amount: number | null };
export type OrderStatusOutcome = { ok: true; changed: boolean; returned: number; clawback: number } | { ok: false; reason: "denied" | "error"; message?: string };

/**
 * The one path for cancelling, refunding or reinstating a sale: the
 * mark_order_status function writes the status, the return movement and the
 * clawback in one database transaction, with the audit triggers watching.
 * unitCost is what the sold units were charged, so they come back at the same
 * cost.
 */
export async function applyOrderStatus(supabase: SupabaseClient, id: string, patch: OrderStatusPatch, unitCost: number | null): Promise<OrderStatusOutcome> {
  const { data, error } = await supabase.rpc("mark_order_status", {
    p_id: id,
    p_status: patch.status,
    p_date: patch.date,
    p_reason: patch.reason,
    p_refund: patch.refund_amount,
    p_unit_cost: unitCost,
  });
  if (error) return { ok: false, reason: /not found|not allowed/i.test(error.message) ? "denied" : "error", message: error.message };
  const result = (data ?? {}) as { changed?: boolean; returned?: number; clawback?: number };
  return { ok: true, changed: Boolean(result.changed), returned: Number(result.returned ?? 0), clawback: Number(result.clawback ?? 0) };
}
