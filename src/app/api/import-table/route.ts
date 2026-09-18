import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectFileType, detectMapping, FIELD_KEYS, mappingIsUsable, ordersFromRows, parseTable, settlementsFromRows, type ColumnMapping, type FieldKey, type ImportedOrder } from "@/lib/import/tiktok";
import { existingOrders, importContext, payoutRowsFor, reviewRowsFor } from "@/lib/import/server";
import type { ParsedOrder, ParsedPayout, ParseResponse } from "@/lib/parse/schema";
import { round2 } from "@/lib/money";
import { PEOPLE, PLATFORMS } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_ROWS = 5000;

const FieldsSchema = z.object({
  platform: z.enum(PLATFORMS),
  received_by: z.enum(PEOPLE),
  mapping: z.string().max(10_000).optional(),
});

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
}

function cleanMapping(raw: unknown): ColumnMapping {
  const out: ColumnMapping = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of FIELD_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key as FieldKey] = v.trim();
  }
  return out;
}

/** A Seller Center order as the review understands it: one parsed order per order id, with its lines summarised. */
function toParsedOrder(o: ImportedOrder): ParsedOrder {
  const first = o.lines[0];
  return {
    order_id: o.order_id,
    date: o.paid_at ?? o.created_at ?? o.delivered_at ?? null,
    customer_name: o.buyer_name,
    product_line: "sugar",
    gross_amount: o.order_amount,
    net_amount: o.seller_received,
    status: o.delivered_at ? "settled_not_withdrawn" : "pending",
    order_status: o.status === "unknown" ? "active" : o.status,
    note: o.lines.map((l) => `${l.sku_name}${l.variant ? ` ${l.variant}` : ""} x${l.quantity}`).join(", ") || null,
    product_name: first?.sku_name ?? null,
    variant: first?.variant ?? null,
    quantity: o.quantity > 0 ? o.quantity : null,
  };
}

/**
 * Seller Center CSV or XLSX export: detect what the file is, read its
 * columns by meaning (the saved mapping wins over detection), keep the file,
 * and answer with the same review shape the screenshot path uses.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("business_id, role").eq("id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "no-profile" }, { status: 403 });
  const businessId = profile.business_id as string;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad-form" }, { status: 400 });
  }
  const fields = FieldsSchema.safeParse({ platform: form.get("platform"), received_by: form.get("received_by"), mapping: form.get("mapping") ?? undefined });
  if (!fields.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "file-too-large" }, { status: 400 });
  const { platform, received_by } = fields.data;

  const bytes = new Uint8Array(await file.arrayBuffer());
  let table;
  try {
    table = await parseTable(bytes, file.name);
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }
  if (table.rows.length > MAX_ROWS) return NextResponse.json({ error: "too-many-rows", max: MAX_ROWS }, { status: 413 });
  const fileType = detectFileType(table.headers);
  if (fileType === "unknown") return NextResponse.json({ error: "unknown-file", headers: table.headers }, { status: 422 });

  // Mapping: detected, then the saved one for this file type, then what the admin just adjusted.
  const { data: saved } = await supabase.from("import_mappings").select("mapping").eq("business_id", businessId).eq("file_type", fileType).maybeSingle();
  const overrides = fields.data.mapping ? cleanMapping(JSON.parse(fields.data.mapping)) : {};
  const headerSet = new Set(table.headers);
  const usable = (m: ColumnMapping): ColumnMapping => Object.fromEntries(Object.entries(m).filter(([, h]) => h && headerSet.has(h))) as ColumnMapping;
  const mapping: ColumnMapping = { ...detectMapping(table.headers, fileType), ...usable(cleanMapping(saved?.mapping)), ...usable(overrides) };
  const check = mappingIsUsable(mapping, fileType);
  if (!check.ok) return NextResponse.json({ error: "columns-missing", missing: check.missing, headers: table.headers, mapping, file_type: fileType }, { status: 422 });

  // Keep the file.
  const admin = createAdminClient();
  const path = `${businessId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error: upErr } = await admin.storage.from("reports").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ error: "upload-failed" }, { status: 500 });
  const { data: upload } = await supabase.from("report_uploads").insert({ business_id: businessId, platform, file_url: path, parsed: false }).select("id").single();

  const ctx = await importContext(supabase, businessId);
  const warnings: string[] = [];
  let rows: ParseResponse["rows"] = [];
  let payouts: ParseResponse["payouts"] = [];
  if (fileType === "orders") {
    const orders = ordersFromRows(table.rows, mapping);
    const parsed = orders.map(toParsedOrder);
    const existing = await existingOrders(supabase, businessId, platform, parsed.map((o) => o.order_id ?? ""));
    rows = reviewRowsFor(parsed, platform, received_by, ctx, existing);
    const unknown = orders.filter((o) => o.status === "unknown").length;
    if (unknown) warnings.push(`${unknown} order(s) had a status the import does not know; treated as active.`);
  } else {
    const settlements = settlementsFromRows(table.rows, mapping);
    const byDay = new Map<string, number>();
    for (const s of settlements) {
      const day = s.settled_at ?? "?";
      byDay.set(day, round2((byDay.get(day) ?? 0) + s.amount));
    }
    const parsedPayouts: ParsedPayout[] = Array.from(byDay.entries())
      .filter(([, amount]) => amount > 0)
      .map(([date, amount]) => ({ date: date === "?" ? null : date, amount, note: "Seller Center statement" }));
    payouts = await payoutRowsFor(supabase, parsedPayouts, platform, received_by);
    const negative = settlements.filter((s) => s.amount < 0).length;
    if (negative) warnings.push(`${negative} adjustment row(s) with a negative amount were netted into the day's payout.`);
  }

  const body: ParseResponse = {
    upload_ids: upload ? [upload.id as string] : [],
    rows,
    payouts,
    batches: 1,
    warnings,
    table: { file_type: fileType, headers: table.headers, mapping: mapping as Record<string, string>, rows: table.rows.length },
  };
  if (upload) await supabase.from("report_uploads").update({ parse_result: { rows: rows.length, payouts: payouts.length, file_type: fileType, mapping } }).eq("id", upload.id);
  return NextResponse.json(body);
}
