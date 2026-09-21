"use server";

import { recordAudit } from "@/lib/audit";
import { requireAdmin, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { z } from "zod";
import { CommitSchema, commitRows, MappingSchema, type CommitResult as CoreResult } from "@/lib/import/commit";
import { parseCsv, readXlsxSheets } from "@/lib/import/table";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeStatements, readStatement, type Statement } from "@/lib/tiktok/statement";
import { applyStatement, type StatementOutcome } from "@/lib/tiktok/statement-apply";
import { PEOPLE } from "@/lib/types";

const StatementConfirmSchema = z.object({ upload_ids: z.array(z.string().uuid()).min(1).max(50), received_by: z.enum(PEOPLE) });

export type CommitResult = { ok: true; inserted: number; cancellations: number; payouts: number; skipped: number } | { ok: false; error: string };

/**
 * The only path from a review table into the ledger, screenshots and Seller
 * Center exports alike. Runs after the user has reviewed and confirmed rows,
 * never automatically. Rows that came from the TikTok sync queue are settled
 * in the queue as well.
 */
export async function commitImport(input: unknown): Promise<CommitResult> {
  const session = await requireSession();
  const { supabase, profile, userId } = session;
  const parsed = CommitSchema.extend({ queue_ids: CommitSchema.shape.upload_ids }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { queue_ids, ...payload } = parsed.data;
  const result: CoreResult = await commitRows(supabase, profile.business_id, payload, { createdBy: userId, audit: (entry) => recordAudit(session, entry) });
  if (!result.ok) return { ok: false, error: "save" };
  if (queue_ids.length) await supabase.from("sync_queue").update({ status: "confirmed", updated_at: new Date().toISOString() }).in("id", queue_ids).eq("business_id", profile.business_id);
  ledgerChanged(profile.business_id);
  return { ok: true, inserted: result.inserted, cancellations: result.cancellations, payouts: result.payouts, skipped: result.skipped };
}

/**
 * Applies the TikTok Finance statements of a confirmed drop. The files are
 * read again from the stored originals, so nothing about money travels
 * through the browser; a second confirm of the same file changes nothing.
 */
export async function confirmStatement(input: unknown): Promise<StatementOutcome> {
  const session = await requireSession();
  const { supabase, profile, userId } = session;
  const parsed = StatementConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { data: uploads } = await supabase.from("report_uploads").select("id, file_url, parse_result").eq("business_id", profile.business_id).in("id", parsed.data.upload_ids);
  const wanted = (uploads ?? []).filter((u) => (u.parse_result as { file_type?: string } | null)?.file_type === "statement");
  if (!wanted.length) return { ok: false, error: "no-statement" };
  const admin = createAdminClient();
  const statements: Statement[] = [];
  for (const u of wanted) {
    if (!String(u.file_url).startsWith(`${profile.business_id}/`)) continue;
    const { data: blob } = await admin.storage.from("reports").download(u.file_url as string);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const zipped = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const statement = zipped ? readStatement(await readXlsxSheets(bytes)) : readStatement({ "Order details": parseCsv(new TextDecoder("utf-8").decode(bytes)) });
    if (statement) statements.push(statement);
  }
  if (!statements.length) return { ok: false, error: "unreadable" };
  const name = wanted.map((u) => (u.parse_result as { file_name?: string } | null)?.file_name ?? "statement").join(", ");
  const outcome = await applyStatement(supabase, profile.business_id, mergeStatements(statements), { receivedBy: parsed.data.received_by, createdBy: userId, fileName: name, uploadId: wanted[0].id as string, audit: (entry) => recordAudit(session, entry) });
  if (outcome.ok) await supabase.from("report_uploads").update({ parsed: true }).in("id", wanted.map((u) => u.id as string)).eq("business_id", profile.business_id);
  ledgerChanged(profile.business_id);
  return outcome;
}

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

/** A synced order nobody wants in the ledger (a test order, a duplicate shop): out of the queue for good. */
export async function dismissQueued(ids: string[]): Promise<{ ok: boolean }> {
  const { supabase, profile } = await requireSession();
  const clean = (Array.isArray(ids) ? ids : []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  if (!clean.length) return { ok: false };
  const { error } = await supabase.from("sync_queue").update({ status: "dismissed", updated_at: new Date().toISOString() }).in("id", clean).eq("business_id", profile.business_id);
  return { ok: !error };
}

/** A TikTok SKU gets its product once; every later row from a file or from the API resolves through it. */
export async function mapSku(skuKey: string, productId: string): Promise<{ ok: boolean }> {
  const { supabase, profile, userId } = await requireSession();
  if (typeof skuKey !== "string" || !skuKey.trim() || skuKey.length > 400 || !/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false };
  const { error } = await supabase.from("tiktok_sku_map").upsert({ business_id: profile.business_id, sku_key: skuKey, product_id: productId, learned: false, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "business_id,sku_key" });
  if (!error) ledgerChanged(profile.business_id);
  return { ok: !error };
}
