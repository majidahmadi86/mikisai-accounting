import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractBatch, runWithConcurrency, type BatchInput, type ImageInput } from "@/lib/parse/gemini";
import { chunk, MAX_IMAGES_PER_BATCH, splitTextIntoBatches } from "@/lib/parse/batch";
import { estimateNet } from "@/lib/parse/estimate";
import type { ParsedOrder, ParseResponse, ReviewRow } from "@/lib/parse/schema";
import { todayIso } from "@/lib/money";
import { num, PEOPLE, PLATFORMS, type Platform, type PlatformSetting } from "@/lib/types";
import { matchProduct } from "@/lib/inventory/match";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILES = 12;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const PDF_PAGES_PER_BATCH = 3;
const MAX_PDF_PAGES = 60;
const MAX_BATCHES = 40;
const CONCURRENCY = 3;
/** One report at a time per user; a second request while one runs is refused. */
const inFlight = new Set<string>();

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const FieldsSchema = z.object({
  platform: z.enum(PLATFORMS),
  received_by: z.enum(PEOPLE),
  text: z.string().max(200_000).default(""),
});

/** Checks the first bytes so a client-declared type cannot smuggle another format into storage or Gemini. */
function sniffType(bytes: Uint8Array, declared: string): string | null {
  const hex = Array.from(bytes.subarray(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  const isPng = hex.startsWith("89504e470d0a1a0a");
  const isJpeg = hex.startsWith("ffd8ff");
  const isGif = hex.startsWith("474946383");
  const isWebp = hex.startsWith("52494646") && hex.slice(16, 24) === "57454250";
  const isPdf = hex.startsWith("255044462d");
  if (declared === "image/png" && isPng) return declared;
  if (declared === "image/jpeg" && isJpeg) return declared;
  if (declared === "image/gif" && isGif) return declared;
  if (declared === "image/webp" && isWebp) return declared;
  if (declared === "application/pdf" && isPdf) return declared;
  return null;
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
}

async function splitPdf(bytes: Uint8Array, label: string): Promise<BatchInput[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  if (total > MAX_PDF_PAGES) throw new Error(`pdf-too-long:${total}`);
  if (total <= PDF_PAGES_PER_BATCH) {
    return [{ kind: "pdf", data: Buffer.from(bytes).toString("base64"), label }];
  }
  const out: BatchInput[] = [];
  for (let start = 0; start < total; start += PDF_PAGES_PER_BATCH) {
    const indices = Array.from({ length: Math.min(PDF_PAGES_PER_BATCH, total - start) }, (_, i) => start + i);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, indices);
    pages.forEach((p) => doc.addPage(p));
    out.push({ kind: "pdf", data: await doc.saveAsBase64(), label: `${label} pages ${start + 1}-${start + indices.length}` });
  }
  return out;
}

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

  const fields = FieldsSchema.safeParse({ platform: form.get("platform"), received_by: form.get("received_by"), text: form.get("text") ?? "" });
  if (!fields.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { platform, received_by } = fields.data;
  const text = fields.data.text.trim();

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return NextResponse.json({ error: "too-many-files" }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return NextResponse.json({ error: "file-too-large" }, { status: 400 });
    if (!IMAGE_TYPES.has(f.type) && f.type !== "application/pdf") return NextResponse.json({ error: "unsupported-type" }, { status: 400 });
  }
  if (!text && files.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });

  if (inFlight.has(user.id)) return NextResponse.json({ error: "busy" }, { status: 429 });
  inFlight.add(user.id);
  try {
    return await handle();
  } finally {
    inFlight.delete(user.id);
  }

  async function handle(): Promise<Response> {
  // 1. Validate every file (magic bytes, PDF page count) before anything is stored.
  const prepared: { name: string; type: string; bytes: Uint8Array; pdfBatches?: BatchInput[] }[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const type = sniffType(bytes, f.type);
    if (!type) return NextResponse.json({ error: "unsupported-type" }, { status: 400 });
    if (type === "application/pdf") {
      try {
        prepared.push({ name: f.name, type, bytes, pdfBatches: await splitPdf(bytes, f.name) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        return NextResponse.json({ error: msg.startsWith("pdf-too-long") ? "pdf-too-long" : "bad-pdf" }, { status: 400 });
      }
    } else {
      prepared.push({ name: f.name, type, bytes });
    }
  }

  // 2. Store the originals and record an upload row per file.
  const admin = createAdminClient();
  const uploadIds: string[] = [];
  const stamp = Date.now();

  async function storeAndRecord(path: string, body: Uint8Array | string, contentType: string) {
    const { error: upErr } = await admin.storage.from("reports").upload(path, body, { contentType, upsert: false });
    if (upErr) throw new Error(`storage: ${upErr.message}`);
    const { data, error } = await supabase.from("report_uploads").insert({ business_id: businessId, platform, file_url: path, parsed: false }).select("id").single();
    if (error || !data) throw new Error(`report_uploads: ${error?.message ?? "no row"}`);
    uploadIds.push(data.id);
  }

  const batches: BatchInput[] = [];
  try {
    if (text) {
      await storeAndRecord(`${businessId}/${stamp}-${crypto.randomUUID()}-pasted.txt`, text, "text/plain; charset=utf-8");
      for (const t of splitTextIntoBatches(text)) batches.push({ kind: "text", text: t });
    }
    const images: ImageInput[] = [];
    for (const f of prepared) {
      await storeAndRecord(`${businessId}/${stamp}-${crypto.randomUUID()}-${safeName(f.name)}`, f.bytes, f.type);
      if (f.pdfBatches) batches.push(...f.pdfBatches);
      else images.push({ media_type: f.type as ImageInput["media_type"], data: Buffer.from(f.bytes).toString("base64") });
    }
    for (const group of chunk(images, MAX_IMAGES_PER_BATCH)) batches.push({ kind: "images", images: group });
  } catch (err) {
    console.error("[parse-report] upload failed", err);
    return NextResponse.json({ error: "upload-failed" }, { status: 500 });
  }
  if (batches.length > MAX_BATCHES) return NextResponse.json({ error: "report-too-long", batches: batches.length, max: MAX_BATCHES }, { status: 413 });

  // 2. Paginate: one Gemini call per batch, bounded concurrency, partial failures tolerated.
  const warnings: string[] = [];
  const results = await runWithConcurrency(batches, CONCURRENCY, async (batch, i) => {
    try {
      return await extractBatch(batch, platform);
    } catch (err) {
      console.error(`[parse-report] batch ${i + 1} failed`, err);
      warnings.push(`Section ${i + 1} of ${batches.length} could not be read.`);
      return null;
    }
  });
  const succeeded = results.filter((r) => r !== null);
  if (succeeded.length === 0) return NextResponse.json({ error: "parse-failed" }, { status: 502 });

  // 3. Merge, dedupe on order id, fill missing net from platform settings, match products.
  const [{ data: settingsRows }, { data: productRows }] = await Promise.all([
    supabase.from("platform_settings").select("platform, commission_pct, fixed_fee"),
    supabase.from("products").select("id, name, variant, product_line, active").eq("business_id", businessId).is("deleted_at", null),
  ]);
  const products = (productRows ?? []).filter((p) => p.active);
  const settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[] = (settingsRows ?? []).map((r) => ({
    platform: r.platform as Platform,
    commission_pct: num(r.commission_pct),
    fixed_fee: num(r.fixed_fee),
  }));

  const seen = new Set<string>();
  const rows: ReviewRow[] = [];
  for (const batch of succeeded) {
    warnings.push(...batch.warnings);
    for (const order of batch.orders as ParsedOrder[]) {
      const key = order.order_id?.trim();
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const netEstimated = order.net_amount == null && order.gross_amount != null;
      const match = matchProduct(products, order.product_name, order.variant, order.note, order.product_line);
      rows.push({
        ...order,
        order_id: key || null,
        date: order.date && /^\d{4}-\d{2}-\d{2}$/.test(order.date) ? order.date : todayIso(),
        gross_amount: order.gross_amount == null ? null : Math.round(order.gross_amount * 100) / 100,
        net_amount: netEstimated ? estimateNet(order.gross_amount as number, platform, settings) : order.net_amount == null ? null : Math.round(order.net_amount * 100) / 100,
        net_estimated: netEstimated,
        key: crypto.randomUUID(),
        include: true,
        platform,
        received_by,
        quantity: order.quantity && order.quantity > 0 ? Math.round(order.quantity) : 1,
        product_line: match?.product_line ?? order.product_line,
        product_id: match?.id ?? null,
        product_matched: Boolean(match),
      });
    }
  }

  const body: ParseResponse = { upload_ids: uploadIds, rows, batches: batches.length, warnings: Array.from(new Set(warnings)) };

  if (uploadIds.length) {
    await supabase.from("report_uploads").update({ parse_result: { rows, warnings: body.warnings, batches: batches.length } }).in("id", uploadIds);
  }

  return NextResponse.json(body);
  }
}
