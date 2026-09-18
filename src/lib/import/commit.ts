import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { FIELD_KEYS } from "@/lib/import/tiktok";
import { findDuplicateOrder, writeItems } from "@/lib/ledger/insert";
import { applyOrderStatus } from "@/lib/ledger/status";
import { round2 } from "@/lib/money";
import { matchPayout, proposeForAmount } from "@/lib/payouts/confirm";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES } from "@/lib/types";

const money = z.coerce.number().min(0).max(99_999_999);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const CommitRowSchema = z.object({
  date: z.string().regex(ISO),
  platform: z.enum(PLATFORMS),
  product_line: z.enum(PRODUCT_LINES),
  gross_amount: money,
  net_amount: money,
  received_by: z.enum(PEOPLE),
  status: z.enum(SETTLEMENT_STATUSES),
  customer_name: z.string().trim().max(200).nullable(),
  order_id: z.string().trim().max(100).nullable(),
  note: z.string().trim().max(2000).nullable(),
  product_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100_000),
  tags: z.array(z.enum(["date_assumed", "qty_inferred"])).default([]),
  /** cancelled or refunded orders are saved and marked in one go. */
  order_status: z.enum(["active", "cancelled", "refunded"]).default("active"),
  refund_amount: z.coerce.number().min(0).max(99_999_999).nullable().default(null),
});

export const StatusChangeSchema = z.object({
  transaction_id: z.string().uuid(),
  order_status: z.enum(["cancelled", "refunded"]),
  date: z.string().regex(ISO),
  refund_amount: z.coerce.number().min(0).max(99_999_999).nullable().default(null),
});

export const PayoutInputSchema = z.object({
  date: z.string().regex(ISO),
  platform: z.enum(PLATFORMS),
  amount: z.coerce.number().positive().max(99_999_999),
  received_by: z.enum(PEOPLE),
  note: z.string().trim().max(500).default(""),
  /** The platform's own id for the payment, so a sync never records it twice. */
  external_ref: z.string().trim().max(100).nullable().default(null),
});

export const CommitSchema = z.object({
  rows: z.array(CommitRowSchema).max(500).default([]),
  status_changes: z.array(StatusChangeSchema).max(500).default([]),
  payouts: z.array(PayoutInputSchema).max(50).default([]),
  upload_ids: z.array(z.string().uuid()).max(50).default([]),
  source: z.enum(["csv", "screenshots", "tiktok"]).default("screenshots"),
  skipped: z.coerce.number().int().min(0).default(0),
});

export type CommitRow = z.infer<typeof CommitRowSchema>;
export type CommitPayload = z.infer<typeof CommitSchema>;
export type CommitResult = { ok: true; inserted: number; cancellations: number; payouts: number; skipped: number; transaction_ids: string[] } | { ok: false; error: string };

export const MappingSchema = z.object({
  file_type: z.enum(["orders", "finance"]),
  mapping: z.record(z.enum(FIELD_KEYS), z.string().trim().max(200)),
});

export type AuditEntry = { action: "confirm_import" | "confirm_payout"; entity_type: "report" | "payout"; entity_id: string | null; before?: Record<string, unknown> | null; after: Record<string, unknown> };

/**
 * The only path from a review into the ledger: new orders inserted (already
 * marked cancelled or refunded when they arrived that way), status changes
 * applied to existing orders, payouts created and matched oldest first,
 * duplicates skipped, the run logged so Home can say what last fed the ledger.
 * Runs through the caller's client: a signed-in user under RLS from the Import
 * page, the service role from the TikTok sync.
 */
export async function commitRows(db: SupabaseClient, businessId: string, payload: CommitPayload, opts: { createdBy: string | null; audit: (entry: AuditEntry) => Promise<void> }): Promise<CommitResult> {
  const { rows: wanted, status_changes, payouts, upload_ids, source } = payload;
  let skipped = payload.skipped;

  const rows: CommitRow[] = [];
  for (const r of wanted) {
    if (r.order_id && (await findDuplicateOrder(db, businessId, r.platform, r.order_id))) {
      skipped += 1;
      continue;
    }
    rows.push(r);
  }

  const inserted: { id: string; row: CommitRow }[] = [];
  if (rows.length) {
    const { data, error } = await db
      .from("transactions")
      .insert(
        rows.map((r) => ({
          business_id: businessId,
          type: "income" as const,
          date: r.date,
          platform: r.platform,
          product_line: r.product_line,
          gross_amount: r.gross_amount,
          net_amount: r.net_amount,
          received_by: r.received_by,
          payer: null,
          category_id: null,
          customer_name: r.customer_name || null,
          quantity: r.quantity,
          order_ref: r.order_id || null,
          note: r.note ?? "",
          tags: r.tags,
          ...(opts.createdBy ? { created_by: opts.createdBy } : {}),
        })),
      )
      .select("id");
    if (error || !data) return { ok: false, error: `save: ${error?.message ?? "no rows"}` };
    data.forEach((tx, i) => inserted.push({ id: tx.id as string, row: rows[i] }));

    const { error: sErr } = await db.from("settlements").insert(
      inserted.map(({ id, row }) => ({
        business_id: businessId,
        transaction_id: id,
        status: row.status,
        settled_at: row.status === "received_in_bank" ? new Date().toISOString() : null,
        paid_amount: row.status === "received_in_bank" ? row.net_amount : 0,
        ...(opts.createdBy ? { created_by: opts.createdBy } : {}),
      })),
    );
    if (sErr) {
      await db.from("transactions").delete().in("id", inserted.map((t) => t.id));
      return { ok: false, error: `settlements: ${sErr.message}` };
    }
    await Promise.all(inserted.map(({ id, row }) => writeItems(db, id, [{ product_id: row.product_id, qty: row.quantity, unit_price: round2(row.gross_amount / row.quantity) }], "none")));
  }

  let cancellations = 0;
  for (const { id, row } of inserted) {
    if (row.order_status === "active") continue;
    const outcome = await applyOrderStatus(db, id, { status: row.order_status, date: row.date, reason: `from ${source}`, refund_amount: row.refund_amount }, null);
    if (outcome.ok) cancellations += 1;
  }
  for (const change of status_changes) {
    const outcome = await applyOrderStatus(db, change.transaction_id, { status: change.order_status, date: change.date, reason: `from ${source}`, refund_amount: change.refund_amount }, null);
    if (outcome.ok && outcome.changed) cancellations += 1;
  }

  let payoutsMade = 0;
  for (const p of payouts) {
    if (p.external_ref) {
      const { data: dup } = await db.from("payouts").select("id").eq("business_id", businessId).eq("platform", p.platform).eq("external_ref", p.external_ref).is("deleted_at", null).maybeSingle();
      if (dup) {
        skipped += 1;
        continue;
      }
    }
    const { data: created, error } = await db
      .from("payouts")
      .insert({ business_id: businessId, date: p.date, platform: p.platform, amount_received: p.amount, received_by: p.received_by, note: p.note, external_ref: p.external_ref, ...(opts.createdBy ? { created_by: opts.createdBy } : {}) })
      .select("id")
      .single();
    if (error || !created) continue;
    const { proposal } = await proposeForAmount(db, businessId, p.platform, p.amount);
    // Only a match inside the tolerance is applied on its own; otherwise the payout waits on Payouts for one tap.
    const result = proposal.matched ? await matchPayout(db, businessId, created.id as string, proposal.selectedIds) : null;
    await opts.audit({ action: "confirm_payout", entity_type: "payout", entity_id: created.id as string, before: null, after: { settlement_ids: result?.settlementIds ?? [], orders: result?.orders ?? 0, amount_received: p.amount, clawbacks_offset: result?.clawbackOffset ?? 0, matched: Boolean(result), source } });
    payoutsMade += 1;
  }

  if (upload_ids.length) await db.from("report_uploads").update({ parsed: true }).in("id", upload_ids).eq("business_id", businessId);
  if (inserted.length || cancellations || payoutsMade || skipped) {
    await db.from("import_runs").insert({ business_id: businessId, source, orders: inserted.length, cancellations, payouts: payoutsMade, skipped, ...(opts.createdBy ? { created_by: opts.createdBy } : {}) });
  }
  await opts.audit({
    action: "confirm_import",
    entity_type: "report",
    entity_id: upload_ids[0] ?? null,
    after: {
      source,
      orders: inserted.length,
      cancellations,
      payouts: payoutsMade,
      skipped,
      platform: rows[0]?.platform ?? payouts[0]?.platform ?? null,
      gross_total: round2(rows.reduce((s, r) => s + r.gross_amount, 0)),
      net_total: round2(rows.reduce((s, r) => s + r.net_amount, 0)),
      transaction_ids: inserted.map((t) => t.id),
      upload_ids,
    },
  });
  return { ok: true, inserted: inserted.length, cancellations, payouts: payoutsMade, skipped, transaction_ids: inserted.map((t) => t.id) };
}
