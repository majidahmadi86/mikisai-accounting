"use server";

import { z } from "zod";
import { recordDenied, requireSession } from "@/lib/auth";
import { getLedgerSnapshot, ledgerChanged } from "@/lib/data/ledger";
import { valueStock } from "@/lib/inventory/valuation";
import { applyOrderStatus, type OrderStatusOutcome } from "@/lib/ledger/status";
import { round2 } from "@/lib/money";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const StatusSchema = z.object({
  status: z.enum(["cancelled", "refunded"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(300).default(""),
  refund_amount: z.coerce.number().min(0).max(99_999_999).nullable().default(null),
});

/** What one sold unit was charged, so a return puts it back at the same cost. */
async function soldUnitCost(businessId: string, transactionId: string): Promise<number | null> {
  const snapshot = await getLedgerSnapshot(businessId);
  const cogs = valueStock(snapshot.products, snapshot.movements).cogsByTransaction.get(transactionId) ?? 0;
  const units = snapshot.items.filter((i) => i.transaction_id === transactionId).reduce((a, i) => a + i.qty, 0);
  return units > 0 && cogs > 0 ? round2(cogs / units) : null;
}

/** One tap from the ledger: mark a sale cancelled or refunded. */
export async function setOrderStatus(id: string, input: unknown): Promise<OrderStatusOutcome> {
  const session = await requireSession();
  if (!UUID.test(id)) return { ok: false, reason: "error", message: "bad id" };
  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "error", message: "invalid" };
  const unitCost = await soldUnitCost(session.profile.business_id, id);
  const outcome = await applyOrderStatus(session.supabase, id, parsed.data, unitCost);
  if (!outcome.ok && outcome.reason === "denied") await recordDenied(session, "transaction", id, { attempted: "order_status" });
  if (outcome.ok) ledgerChanged(session.profile.business_id);
  return outcome;
}

/** Admin: put a cancelled or refunded sale back to active (unless its clawback was already offset). */
export async function reinstateOrder(id: string): Promise<OrderStatusOutcome> {
  const session = await requireSession();
  if (!UUID.test(id)) return { ok: false, reason: "error", message: "bad id" };
  if (session.profile.role !== "admin") {
    await recordDenied(session, "transaction", id, { attempted: "reinstate" });
    return { ok: false, reason: "denied" };
  }
  const outcome = await applyOrderStatus(session.supabase, id, { status: "active", date: new Date().toISOString().slice(0, 10), reason: "", refund_amount: null }, null);
  if (outcome.ok) ledgerChanged(session.profile.business_id);
  return outcome;
}
