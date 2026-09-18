"use server";

import { recordDenied, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { isSoftDeleteTarget, SOFT_DELETE_TABLE, type SoftDeleteEntity } from "@/lib/soft-delete";

/**
 * Marks a row deleted. Nothing is removed: the row is hidden everywhere and
 * listed under More → Recently deleted. Row level security decides who may do
 * this (admin: any row; contributor: own rows for 24 hours, which covers the
 * quick-entry undo). A refusal is recorded in the audit log.
 */
export async function softDelete(entity: SoftDeleteEntity, id: string): Promise<{ ok: boolean }> {
  if (!isSoftDeleteTarget(entity, id)) return { ok: false };
  const session = await requireSession();
  const { supabase, profile, userId } = session;

  if (entity === "payout") {
    // Orders matched to this payout go back to waiting so the balance stays honest.
    await supabase.from("settlements").update({ status: "pending", settled_at: null, payout_id: null, paid_amount: 0 }).eq("payout_id", id).is("deleted_at", null);
  }

  const { error, count } = await supabase
    .from(SOFT_DELETE_TABLE[entity])
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId }, { count: "exact" })
    .eq("id", id)
    .eq("business_id", profile.business_id)
    .is("deleted_at", null);
  if (error || !count) {
    await recordDenied(session, entity, id, { attempted: "soft_delete" });
    return { ok: false };
  }
  ledgerChanged(profile.business_id);
  return { ok: true };
}

/** Brings a soft-deleted row back. Admin only by policy; a contributor's attempt is recorded. */
export async function restore(entity: SoftDeleteEntity, id: string): Promise<{ ok: boolean }> {
  if (!isSoftDeleteTarget(entity, id)) return { ok: false };
  const session = await requireSession();
  const { supabase, profile } = session;
  if (profile.role !== "admin") {
    await recordDenied(session, entity, id, { attempted: "restore" });
    return { ok: false };
  }
  const { error, count } = await supabase
    .from(SOFT_DELETE_TABLE[entity])
    .update({ deleted_at: null, deleted_by: null }, { count: "exact" })
    .eq("id", id)
    .eq("business_id", profile.business_id)
    .not("deleted_at", "is", null);
  if (error || !count) {
    await recordDenied(session, entity, id, { attempted: "restore" });
    return { ok: false };
  }
  ledgerChanged(profile.business_id);
  return { ok: true };
}
