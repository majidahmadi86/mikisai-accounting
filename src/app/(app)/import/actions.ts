"use server";

import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireAdmin, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { FIELD_KEYS } from "@/lib/import/tiktok";
import { round2 } from "@/lib/money";
import { findDuplicateOrder, writeItems } from "@/lib/ledger/insert";
import { applyOrderStatus } from "@/lib/ledger/status";
import { matchPayout, proposeForAmount } from "@/lib/payouts/confirm";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES } from "@/lib/types";

const money = z.coerce.number().min(0).max(99_999_999);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const CommitRowSchema = z.object({
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
});

const StatusChangeSchema = z.object({
  transaction_id: z.string().uuid(),
  order_status: z.enum(["cancelled", "refunded"]),
  date: z.string().regex(ISO),
  refund_amount: z.coerce.number().min(0).max(99_999_999).nullable().default(null),
});

const PayoutSchema = z.object({
  date: z.string().regex(ISO),
  platform: z.enum(PLATFORMS),
  amount: z.coerce.number().positive().max(99_999_999),
  received_by: z.enum(PEOPLE),
  note: z.string().trim().max(500).default(""),
});

export type CommitRow = z.infer<typeof CommitRowSchema>;

const CommitSchema = z.object({
  rows: z.array(CommitRowSchema).max(500).default([]),
  status_changes: z.array(StatusChangeSchema).max(500).default([]),
  payouts: z.array(PayoutSchema).max(50).default([]),
  upload_ids: z.array(z.string().uuid()).max(50),
  source: z.enum(["csv", "screenshots"]).default("screenshots"),
  skipped: z.coerce.number().int().min(0).default(0),
});

export type CommitResult = { ok: true; inserted: number; cancellations: number; payouts: number; skipped: number } | { ok: false; error: string };

/**
 * The only path from a review table into the ledger, screenshots and Seller
 * Center exports alike. Runs after the user has reviewed and confirmed rows,
 * never automatically: new orders are inserted, cancellations applied to
 * existing orders, payouts created and matched oldest-first, duplicates
 * skipped, and the run logged so Home can say what last fed the ledger.
 */
export async function commitImport(input: unknown): Promise<CommitResult> {
  const session = await requireSession();
  const { supabase, profile } = session;
  const parsed = CommitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { rows: wanted, status_changes, payouts, upload_ids, source } = parsed.data;
  let skipped = parsed.data.skipped;

  // Duplicates are skipped here too, in case the ledger changed since the review was built.
  const rows: CommitRow[] = [];
  for (const r of wanted) {
    if (r.order_id && (await findDuplicateOrder(supabase, profile.business_id, r.platform, r.order_id))) {
      skipped += 1;
      continue;
    }
    rows.push(r);
  }

  const inserted: { id: string; row: CommitRow }[] = [];
  if (rows.length) {
    const { data, error } = await supabase
      .from("transactions")
      .insert(
        rows.map((r) => ({
          business_id: profile.business_id,
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
        })),
      )
      .select("id");
    if (error || !data) return { ok: false, error: "save" };
    data.forEach((tx, i) => inserted.push({ id: tx.id as string, row: rows[i] }));

    const { error: sErr } = await supabase.from("settlements").insert(
      inserted.map(({ id, row }) => ({
        business_id: profile.business_id,
        transaction_id: id,
        status: row.status,
        settled_at: row.status === "received_in_bank" ? new Date().toISOString() : null,
        paid_amount: row.status === "received_in_bank" ? row.net_amount : 0,
      })),
    );
    if (sErr) {
      await supabase.from("transactions").delete().in("id", inserted.map((t) => t.id));
      return { ok: false, error: "save" };
    }
    // One product line per imported order; the RPC also writes the sale movement.
    await Promise.all(inserted.map(({ id, row }) => writeItems(supabase, id, [{ product_id: row.product_id, qty: row.quantity, unit_price: round2(row.gross_amount / row.quantity) }], "none")));
  }

  // Orders that arrived already cancelled or refunded, and existing orders whose status changed.
  let cancellations = 0;
  for (const { id, row } of inserted) {
    if (row.order_status === "active") continue;
    const outcome = await applyOrderStatus(supabase, id, { status: row.order_status, date: row.date, reason: "from import", refund_amount: null }, null);
    if (outcome.ok) cancellations += 1;
  }
  for (const change of status_changes) {
    const outcome = await applyOrderStatus(supabase, change.transaction_id, { status: change.order_status, date: change.date, reason: "from import", refund_amount: change.refund_amount }, null);
    if (outcome.ok && outcome.changed) cancellations += 1;
  }

  // Payouts: create, then match the oldest unpaid orders that add up to the amount (plus pending clawbacks).
  let payoutsMade = 0;
  for (const p of payouts) {
    const { data: created, error } = await supabase.from("payouts").insert({ business_id: profile.business_id, date: p.date, platform: p.platform, amount_received: p.amount, received_by: p.received_by, note: p.note }).select("id").single();
    if (error || !created) continue;
    const { proposal } = await proposeForAmount(supabase, p.platform, p.amount);
    const result = await matchPayout(supabase, profile.business_id, created.id as string, proposal.selectedIds);
    await recordAudit(session, { action: "confirm_payout", entity_type: "payout", entity_id: created.id as string, before: null, after: { settlement_ids: result?.settlementIds ?? [], orders: result?.orders ?? 0, amount_received: p.amount, clawbacks_offset: result?.clawbackOffset ?? 0, source } });
    payoutsMade += 1;
  }

  if (upload_ids.length) await supabase.from("report_uploads").update({ parsed: true }).in("id", upload_ids).eq("business_id", profile.business_id);
  await supabase.from("import_runs").insert({ business_id: profile.business_id, source, orders: inserted.length, cancellations, payouts: payoutsMade, skipped });
  await recordAudit(session, {
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
  ledgerChanged(profile.business_id);
  return { ok: true, inserted: inserted.length, cancellations, payouts: payoutsMade, skipped };
}

const MappingSchema = z.object({
  file_type: z.enum(["orders", "finance"]),
  mapping: z.record(z.enum(FIELD_KEYS), z.string().trim().max(200)),
});

/** Admin: remember how this file type's columns map, so the next export reads the same way. */
export async function saveImportMapping(input: unknown): Promise<{ ok: boolean }> {
  const parsed = MappingSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase, profile, userId } = await requireAdmin("report_upload", null, "/import?denied=1");
  const { error } = await supabase.from("import_mappings").upsert({ business_id: profile.business_id, file_type: parsed.data.file_type, mapping: parsed.data.mapping, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "business_id,file_type" });
  return { ok: !error };
}

/** One tap: the assumed date (or inferred quantity) on an imported row is confirmed; the gold tag goes. */
export async function confirmTag(id: string, tag: "date_assumed" | "qty_inferred"): Promise<{ ok: boolean }> {
  const { supabase, profile } = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  const { data, error } = await supabase.rpc("clear_transaction_tag", { p_id: id, p_tag: tag });
  if (error) return { ok: false };
  ledgerChanged(profile.business_id);
  return { ok: Boolean(data) };
}
