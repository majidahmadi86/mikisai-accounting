import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectFileType, detectMapping, FIELD_KEYS, mappingIsUsable, ordersFromRows, parseTable, settlementsFromRows, type ColumnMapping, type FieldKey, type ImportedOrder, type ImportedSettlement } from "@/lib/import/tiktok";
import { existingOrders, importContext } from "@/lib/import/server";
import type { NightlyFile, NightlyReview, StatementReview } from "@/lib/import/nightly";
import { parseCsv, readXlsxSheets } from "@/lib/import/table";
import { mergeStatements, readStatement, type Statement } from "@/lib/tiktok/statement";
import { statementContext } from "@/lib/tiktok/statement-apply";
import { planStatement } from "@/lib/tiktok/statement-plan";
import { todayIso } from "@/lib/money";
import { financeFromFile, ordersFromFile } from "@/lib/tiktok/from-file";
import { planSync } from "@/lib/tiktok/plan";
import { knownPaymentIds, loadSkuMap, rememberSkus } from "@/lib/tiktok/sku-map";
import { PEOPLE } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILES = 12;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_ROWS = 20_000;

const FieldsSchema = z.object({ received_by: z.enum(PEOPLE), mapping_orders: z.string().max(10_000).optional(), mapping_finance: z.string().max(10_000).optional() });

const safeName = (name: string) => name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";

function cleanMapping(raw: unknown): ColumnMapping {
  const out: ColumnMapping = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of FIELD_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key as FieldKey] = v.trim();
  }
  return out;
}

/** A TikTok Finance statement, from an .xlsx workbook or from a CSV of its "Order details" sheet; null for anything else. */
async function statementFrom(bytes: Uint8Array, filename: string): Promise<Statement | null> {
  try {
    const zipped = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (zipped || /\.xlsx$/i.test(filename)) return readStatement(await readXlsxSheets(bytes));
    return readStatement({ "Order details": parseCsv(new TextDecoder("utf-8").decode(bytes)) });
  } catch {
    return null;
  }
}

/**
 * The nightly TikTok files: Orders and Finance exports, any number at once,
 * either drop zone. Each file's type is read from its headers, its columns by
 * meaning (saved mapping first), the original is kept in report_uploads, and
 * the rows run through the same planSync the API sync uses. Nothing is saved
 * here: the answer is one review for one confirm.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("business_id").eq("id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "no-profile" }, { status: 403 });
  const businessId = profile.business_id as string;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad-form" }, { status: 400 });
  }
  const fields = FieldsSchema.safeParse({ received_by: form.get("received_by"), mapping_orders: form.get("mapping_orders") ?? undefined, mapping_finance: form.get("mapping_finance") ?? undefined });
  if (!fields.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!uploads.length) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (uploads.length > MAX_FILES) return NextResponse.json({ error: "too-many-files" }, { status: 400 });
  if (uploads.some((f) => f.size > MAX_FILE_BYTES)) return NextResponse.json({ error: "file-too-large" }, { status: 400 });

  const { data: savedRows } = await supabase.from("import_mappings").select("file_type, mapping").eq("business_id", businessId);
  const saved = new Map((savedRows ?? []).map((r) => [r.file_type as string, cleanMapping(r.mapping)]));
  const overrides = { orders: fields.data.mapping_orders ? cleanMapping(JSON.parse(fields.data.mapping_orders)) : {}, finance: fields.data.mapping_finance ? cleanMapping(JSON.parse(fields.data.mapping_finance)) : {} };

  const admin = createAdminClient();
  const files: NightlyFile[] = [];
  const uploadIds: string[] = [];
  const orderRows: ImportedOrder[] = [];
  const financeRows: ImportedSettlement[] = [];
  const warnings: string[] = [];
  const statements: Statement[] = [];

  for (const file of uploads) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The real Finance statement is recognised first, by its own sheets and headers, in either drop zone.
    const statement = await statementFrom(bytes, file.name);
    if (statement) {
      const path = `${businessId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await admin.storage.from("reports").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
      if (!upErr) {
        const { data: upload } = await supabase.from("report_uploads").insert({ business_id: businessId, platform: "tiktok", file_url: path, parsed: false, parse_result: { file_type: "statement", file_name: file.name, rows: statement.rows.length, wallet_rows: statement.wallet.length, period: statement.period } }).select("id").single();
        if (upload) uploadIds.push(upload.id as string);
      } else warnings.push(`${file.name} could not be stored, so it cannot be confirmed. Try again.`);
      statements.push(statement);
      files.push({ name: file.name, file_type: "statement", period: statement.period, rows: statement.rows.length + statement.wallet.length, headers: [], mapping: {}, error: null, missing: [] });
      continue;
    }
    let table;
    try {
      table = await parseTable(bytes, file.name);
    } catch {
      files.push({ name: file.name, file_type: "unknown", rows: 0, headers: [], mapping: {}, error: "unreadable", missing: [] });
      continue;
    }
    const fileType = detectFileType(table.headers);
    if (fileType === "unknown" || table.rows.length > MAX_ROWS) {
      files.push({ name: file.name, file_type: "unknown", rows: table.rows.length, headers: table.headers, mapping: {}, error: fileType === "unknown" ? "unknown-file" : "too-many-rows", missing: [] });
      continue;
    }
    const headerSet = new Set(table.headers);
    const usable = (m: ColumnMapping): ColumnMapping => Object.fromEntries(Object.entries(m).filter(([, h]) => h && headerSet.has(h))) as ColumnMapping;
    const mapping: ColumnMapping = { ...detectMapping(table.headers, fileType), ...usable(saved.get(fileType) ?? {}), ...usable(overrides[fileType]) };
    const check = mappingIsUsable(mapping, fileType);
    if (!check.ok) {
      files.push({ name: file.name, file_type: fileType, rows: table.rows.length, headers: table.headers, mapping: mapping as Record<string, string>, error: "columns-missing", missing: check.missing });
      continue;
    }
    // Keep the original.
    const path = `${businessId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: upErr } = await admin.storage.from("reports").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
    if (!upErr) {
      const { data: upload } = await supabase.from("report_uploads").insert({ business_id: businessId, platform: "tiktok", file_url: path, parsed: false, parse_result: { file_type: fileType, rows: table.rows.length, mapping } }).select("id").single();
      if (upload) uploadIds.push(upload.id as string);
    } else warnings.push(`${file.name} could not be stored; its rows were still read.`);

    if (fileType === "orders") orderRows.push(...ordersFromRows(table.rows, mapping));
    else financeRows.push(...settlementsFromRows(table.rows, mapping));
    files.push({ name: file.name, file_type: fileType, rows: table.rows.length, headers: table.headers, mapping: mapping as Record<string, string>, error: null, missing: [] });
  }

  // From here on a file row and an API row are the same thing.
  const today = todayIso();
  const fromOrders = ordersFromFile(orderRows, today);
  const fromFinance = financeFromFile(financeRows);
  const merged = statements.length ? mergeStatements(statements) : null;
  // What the statement says TikTok paid per order feeds the same plan the Orders file runs through.
  for (const r of merged?.rows ?? []) if (r.type === "order") fromFinance.settlements.set(r.id, r.settlement);
  const [ctx, skuMap, knownPayments] = await Promise.all([importContext(supabase, businessId), loadSkuMap(supabase, businessId), knownPaymentIds(supabase, businessId, "tiktok")]);
  const refs = [...fromOrders.orders.map((o) => o.order_ref), ...fromFinance.payments.flatMap((p) => p.allocations.map((a) => a.order_ref))];
  const existing = await existingOrders(supabase, businessId, "tiktok", refs);
  const plan = planSync({ orders: fromOrders.orders, returns: fromOrders.returns, settlements: fromFinance.settlements, payments: fromFinance.payments, ctx, existing, receivedBy: fields.data.received_by, today, skuMap, knownPaymentIds: knownPayments });
  await rememberSkus(supabase, businessId, plan.skus);

  let statementReview: StatementReview | null = null;
  if (merged) {
    const sp = planStatement(await statementContext(supabase, businessId, merged, fields.data.received_by));
    const fromOrdersFile = new Set([...plan.auto.map((r) => r.order_id as string), ...plan.queue.map((q) => q.order_ref)]);
    const orderRefs = new Set(fromOrders.orders.map((o) => o.order_ref));
    const statementRefs = new Set(merged.rows.filter((r) => r.type === "order").map((r) => r.id));
    const businessRefs = new Set(sp.facts.filter((f) => f.kind === "order" && !f.pre_business).map((f) => f.order_ref));
    statementReview = {
      period: sp.period,
      rows: merged.rows.length + merged.wallet.length,
      settle: sp.settle.length,
      create: sp.create.filter((c) => !fromOrdersFile.has(c.order_ref)).length,
      fixed: sp.netFixes.map((f) => ({ order_ref: f.order_ref, old: f.old, new: f.new })),
      refunds: sp.refunds.map((r) => ({ order_ref: r.order_ref, loss: r.loss })),
      overweight: sp.overweight,
      needs_product: sp.needsProduct.map((n) => ({ order_ref: n.order_ref, skus: n.skus })),
      pre_business: sp.preBusiness,
      advance: { balance: sp.wallet.advanceBalance, disbursed: sp.wallet.disbursed, recovered: sp.wallet.recovered },
      withdrawals: sp.payouts.map((w) => ({ reference: w.reference, date: w.date, amount: w.amount, bank_suffix: w.bank_suffix, orders: w.orders.length, advance: w.advance, other: w.other })),
      already_known: sp.alreadyKnown,
      missing_from_orders: orderRefs.size ? Array.from(businessRefs).filter((ref) => !orderRefs.has(ref)) : [],
      missing_from_statement: orderRefs.size ? fromOrders.orders.filter((o) => o.delivered && o.status === "active" && !statementRefs.has(o.order_ref) && merged.period && o.date >= merged.period.from && o.date <= merged.period.to).map((o) => o.order_ref) : [],
    };
    for (const m of sp.wallet.earningsMismatch) warnings.push(`Earnings on ${m.date} say ${m.stated.toFixed(2)} but that day's rows add up to ${m.rows.toFixed(2)}.`);
  }

  const inLedgerOrPlan = new Set<string>([...existing.keys(), ...plan.auto.map((r) => r.order_id as string), ...plan.queue.map((q) => q.order_ref)]);
  const body: NightlyReview = {
    upload_ids: uploadIds,
    files,
    ready: plan.autoReview.map((r) => ({ ...r, key: crypto.randomUUID(), include: true })),
    review: plan.queue.map((q) => ({ ...q.row, key: crypto.randomUUID(), include: true, reasons: q.reasons })),
    status_changes: plan.statusChanges,
    payouts: plan.payouts.map((p) => {
      const covered = p.allocations.filter((a) => inLedgerOrPlan.has(a.order_ref));
      return { ...p, key: crypto.randomUUID(), include: true, orders: p.allocations.length, covered_orders: covered.length, covered_amount: Math.round(covered.reduce((s, a) => s + a.amount, 0) * 100) / 100 };
    }),
    skipped: plan.skipped,
    ignored: plan.ignored,
    known_payments: plan.knownPayments,
    missing_status: fromOrders.missingStatus,
    unmapped_skus: plan.skus.filter((s) => !s.product_id).map((s) => ({ sku_key: s.sku_key, sku_name: s.sku_name })),
    warnings,
    statement: statementReview,
  };
  return NextResponse.json(body);
}
