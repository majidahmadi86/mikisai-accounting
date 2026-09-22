import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectFileType, detectMapping, ordersFromRows, parseTable } from "@/lib/import/tiktok";
import { createAdminClient } from "@/lib/supabase/admin";
import { num } from "@/lib/types";
import { planCleanup, type CleanRow, type CleanupPlan, type FileOrder, type SkuTarget } from "./cleanup";

export type WeekCount = { orders: number; units: Record<string, number>; cancelled: number };
export type CleanupView = { plan: CleanupPlan; rows: Map<string, CleanRow>; products: Map<string, string>; before: WeekCount; ordersFiles: number };

/** Every order the stored Orders files describe; a later file wins for the same order. */
export async function ordersFromStoredFiles(db: SupabaseClient, businessId: string): Promise<{ orders: Map<string, FileOrder>; files: number }> {
  const { data: uploads } = await db.from("report_uploads").select("id, file_url, parse_result, uploaded_at").eq("business_id", businessId).order("uploaded_at");
  const wanted = (uploads ?? []).filter((u) => (u.parse_result as { file_type?: string } | null)?.file_type === "orders" && String(u.file_url).startsWith(`${businessId}/`));
  const admin = createAdminClient();
  const orders = new Map<string, FileOrder>();
  let files = 0;
  for (const u of wanted) {
    const { data: blob } = await admin.storage.from("reports").download(u.file_url as string);
    if (!blob) continue;
    const name = String(u.file_url).split("/").pop() ?? "orders.csv";
    try {
      const table = await parseTable(new Uint8Array(await blob.arrayBuffer()), name);
      if (detectFileType(table.headers) !== "orders") continue;
      for (const o of ordersFromRows(table.rows, detectMapping(table.headers, "orders"))) {
        orders.set(o.order_id, { order_ref: o.order_id, cancelled: o.status === "cancelled", shipped: Boolean(o.shipped_at), lines: o.lines.filter((l) => l.sku_id).map((l) => ({ sku_id: (l.sku_id as string).trim(), qty: l.quantity })) });
      }
      files += 1;
    } catch {
      // An unreadable original is skipped; the rest still count.
    }
  }
  return { orders, files };
}

/** Live sales with their lines, and which of them came in through an import. */
export async function cleanRows(db: SupabaseClient, businessId: string): Promise<CleanRow[]> {
  const [{ data: tx }, { data: items }, { data: audits }] = await Promise.all([
    db.from("transactions").select("id, date, order_ref, quantity, gross_amount, net_amount, status, tags, note").eq("business_id", businessId).eq("type", "income").is("deleted_at", null),
    db.from("transaction_items").select("transaction_id, product_id, qty").eq("business_id", businessId).is("deleted_at", null),
    db.from("audit_log").select("after").eq("business_id", businessId).eq("action", "confirm_import"),
  ]);
  const imported = new Set<string>();
  for (const a of audits ?? []) for (const id of ((a.after as { transaction_ids?: string[] } | null)?.transaction_ids ?? [])) imported.add(id);
  const linesOf = new Map<string, { product_id: string; qty: number }[]>();
  for (const i of items ?? []) linesOf.set(i.transaction_id as string, [...(linesOf.get(i.transaction_id as string) ?? []), { product_id: i.product_id as string, qty: num(i.qty) }]);
  return (tx ?? []).map((t) => ({
    id: t.id as string,
    date: t.date as string,
    order_ref: (t.order_ref as string | null) ?? null,
    quantity: num(t.quantity),
    gross_amount: num(t.gross_amount),
    net_amount: num(t.net_amount),
    status: (t.status ?? "active") as CleanRow["status"],
    tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
    note: (t.note as string) ?? "",
    items: linesOf.get(t.id as string) ?? [],
    imported: imported.has(t.id as string),
  }));
}

/** Live orders in a week, units per product, and cancellations before shipping kept out. */
export function weekCount(rows: CleanRow[], from: string, to: string): WeekCount {
  const inWeek = rows.filter((r) => r.date >= from && r.date <= to);
  const live = inWeek.filter((r) => r.status === "active");
  const units: Record<string, number> = {};
  for (const r of live) for (const i of r.items) units[i.product_id] = (units[i.product_id] ?? 0) + i.qty;
  return { orders: live.length, units, cancelled: inWeek.filter((r) => r.tags.includes("cancelled_before_shipping")).length };
}

export async function loadCleanup(db: SupabaseClient, businessId: string, week: { from: string; to: string }): Promise<CleanupView> {
  const [rows, { orders, files }, { data: skuRows }, { data: prods }] = await Promise.all([
    cleanRows(db, businessId),
    ordersFromStoredFiles(db, businessId),
    db.from("tiktok_sku_map").select("sku_key, product_id, multiplier").eq("business_id", businessId),
    db.from("products").select("id, short_name, variant, name").eq("business_id", businessId),
  ]);
  const skus = new Map<string, SkuTarget>((skuRows ?? []).map((s) => [s.sku_key as string, { product_id: (s.product_id as string | null) ?? null, multiplier: Number(s.multiplier) || 1 }]));
  return {
    plan: planCleanup(rows, orders, skus),
    rows: new Map(rows.map((r) => [r.id, r])),
    products: new Map((prods ?? []).map((p) => [p.id as string, (p.short_name as string) || (p.variant as string) || (p.name as string)])),
    before: weekCount(rows, week.from, week.to),
    ordersFiles: files,
  };
}

export type CleanupOutcome = { removed: number; merged: number; cancelled: number; remapped: number; errors: string[] };

/**
 * Applies a cleanup plan with the signed-in admin's own session: soft delete,
 * mark_cancelled_before_shipping and remap_sale_variant each write their audit
 * rows as that person. Nothing is hard-deleted.
 */
export async function applyCleanup(db: SupabaseClient, businessId: string, userId: string, plan: CleanupPlan, rows: Map<string, CleanRow>): Promise<CleanupOutcome> {
  const out: CleanupOutcome = { removed: 0, merged: 0, cancelled: 0, remapped: 0, errors: [] };
  const softDelete = async (id: string) => {
    const { error, count } = await db.from("transactions").update({ deleted_at: new Date().toISOString(), deleted_by: userId }, { count: "exact" }).eq("id", id).eq("business_id", businessId).is("deleted_at", null);
    if (error || !count) out.errors.push(`delete ${id}: ${error?.message ?? "not found"}`);
    return !error && Boolean(count);
  };
  for (const d of plan.exactDuplicates) for (const id of d.remove) if (await softDelete(id)) out.removed += 1;
  for (const m of plan.merges) {
    const keep = rows.get(m.keep);
    if (m.note && keep && !keep.note.includes(m.note)) {
      const note = [keep.note, `Merged from a typed row: ${m.note}`].filter(Boolean).join(" · ").slice(0, 2000);
      await db.from("transactions").update({ note }).eq("id", m.keep).eq("business_id", businessId);
    }
    if (await softDelete(m.remove)) out.merged += 1;
  }
  for (const c of plan.cancelBeforeShipping) {
    const { error } = await db.rpc("mark_cancelled_before_shipping", { p_id: c.id, p_date: null });
    if (error) out.errors.push(`cancel ${c.order_ref}: ${error.message}`);
    else out.cancelled += 1;
  }
  for (const r of plan.remaps) {
    const { error } = await db.rpc("remap_sale_variant", { p_id: r.id, p_from: r.from, p_to: r.to, p_multiplier: 1 });
    if (error) out.errors.push(`variant ${r.order_ref}: ${error.message}`);
    else out.remapped += 1;
  }
  return out;
}
