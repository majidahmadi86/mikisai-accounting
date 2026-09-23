"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordDenied, requireAdmin, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { UNIT_LABELS } from "@/lib/inventory/product-stats";
import { STOCK_MODES } from "@/lib/inventory/valuation";
import { UUID } from "@/lib/soft-delete";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCT_LINES } from "@/lib/types";

const money = z.coerce.number().min(0).max(99_999_999);
const optionalMoney = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), money.optional());

const ProductSchema = z.object({
  name_en: z.string().trim().min(1).max(120),
  name_th: z.string().trim().max(120).default(""),
  purchase_unit_label: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.enum(UNIT_LABELS).nullable()).default(null),
  units_per_purchase_unit: z.coerce.number().int().min(1).max(10_000).default(1),
  variant: z.string().trim().max(120).default(""),
  product_line: z.enum(PRODUCT_LINES).default("other"),
  unit_label: z.enum(UNIT_LABELS).default("box"),
  stock_mode: z.enum(STOCK_MODES).default("buy_to_order"),
  default_cost: money.default(0),
  default_price: money.default(0),
  list_tiktok: optionalMoney,
  list_shopee: optionalMoney,
  list_fb: optionalMoney,
  low_stock_threshold: z.coerce.number().int().min(0).max(100_000).default(3),
  notes: z.string().trim().max(2000).default(""),
  short_name: z.string().trim().max(40).default(""),
  expected_net_per_unit: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().min(0).max(99_999_999).nullable()).default(null),
});

export type NewProductInput = z.input<typeof ProductSchema>;
export type ProductResult = { ok: true; id: string } | { ok: false; error: "invalid" | "save" };

function toRow(input: z.infer<typeof ProductSchema>) {
  const { list_tiktok, list_shopee, list_fb, ...rest } = input;
  const list_prices: Record<string, number> = {};
  if (list_tiktok && list_tiktok > 0) list_prices.tiktok = list_tiktok;
  if (list_shopee && list_shopee > 0) list_prices.shopee = list_shopee;
  if (list_fb && list_fb > 0) list_prices.fb = list_fb;
  // name stays the key imports match on; name_en is what English readers see.
  return { ...rest, name: rest.name_en, list_prices };
}

/** Both roles may add a product (Products page or inline in the quick-entry sheet). */
export async function createProduct(input: unknown): Promise<ProductResult> {
  const { supabase, profile } = await requireSession();
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { data, error } = await supabase.from("products").insert({ business_id: profile.business_id, ...toRow(parsed.data) }).select("id").single();
  if (error || !data) return { ok: false, error: "save" };
  ledgerChanged(profile.business_id);
  return { ok: true, id: data.id };
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PHOTO_MAX = 2 * 1024 * 1024;

/** Stores the photo in the public product-photos bucket and returns its path. Sniffs the bytes; declared type alone is not trusted. */
async function storePhoto(businessId: string, productId: string, file: File): Promise<string | null> {
  if (file.size === 0 || file.size > PHOTO_MAX) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hex = Array.from(bytes.subarray(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  const type = hex.startsWith("ffd8ff") ? "image/jpeg" : hex.startsWith("89504e470d0a1a0a") ? "image/png" : hex.startsWith("52494646") && hex.slice(16, 24) === "57454250" ? "image/webp" : null;
  if (!type) return null;
  const path = `${businessId}/${productId}.${PHOTO_TYPES[type]}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("product-photos").upload(path, bytes, { contentType: type, upsert: true });
  return error ? null : path;
}

/** Products page form: create or update, with optional photo. Admin only for updates; anyone may create. */
export async function saveProductForm(id: string | null, formData: FormData) {
  const raw = Object.fromEntries(Array.from(formData.entries()).filter(([, v]) => typeof v === "string"));
  const parsed = ProductSchema.extend({ active: z.coerce.boolean().default(true) }).safeParse({ ...raw, active: formData.get("active") === "on" || !id });
  if (!parsed.success) redirect(id ? `/products/${id}/edit?error=invalid` : "/products/new?error=invalid");
  const { active, ...rest } = parsed.data;
  const row = { ...toRow(rest), active };
  const photo = formData.get("photo");

  if (!id) {
    const { supabase, profile } = await requireSession();
    const { data, error } = await supabase.from("products").insert({ business_id: profile.business_id, ...row }).select("id").single();
    if (error || !data) redirect("/products/new?error=save");
    if (photo instanceof File && photo.size > 0) {
      const path = await storePhoto(profile.business_id, data.id, photo);
      if (path) await supabase.from("products").update({ photo_path: path }).eq("id", data.id);
    }
    ledgerChanged(profile.business_id);
    redirect(`/products/${data.id}?saved=1`);
  }

  if (!UUID.test(id)) redirect("/products");
  const session = await requireAdmin("product", id, "/products?denied=1");
  const { supabase, profile } = session;
  const patch: Record<string, unknown> = { ...row };
  if (photo instanceof File && photo.size > 0) {
    const path = await storePhoto(profile.business_id, id, photo);
    if (path) patch.photo_path = path;
  }
  if (formData.get("remove_photo") === "on") patch.photo_path = null;
  const { error, count } = await supabase.from("products").update(patch, { count: "exact" }).eq("id", id).eq("business_id", profile.business_id).is("deleted_at", null);
  if (error) redirect(`/products/${id}/edit?error=save`);
  if (!count) {
    await recordDenied(session, "product", id, { attempted: "update" });
    redirect(`/products/${id}/edit?error=denied`);
  }
  ledgerChanged(profile.business_id);
  redirect(`/products/${id}?saved=1`);
}

/** Manual stock correction, admin only: a positive or negative adjustment at an optional unit cost. */
export async function adjustStock(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "");
  const back = formData.get("redirect_to") === "/stock" ? "/stock" : `/products/${productId}`;
  const { supabase, profile } = await requireAdmin("stock_movement", null, `${back}?error=denied`);
  // A count correction always says why.
  const parsed = z
    .object({ product_id: z.string().uuid(), qty: z.coerce.number().int().refine((n) => n !== 0), unit_cost: optionalMoney, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().min(3).max(500) })
    .safeParse({ product_id: productId, qty: formData.get("qty"), unit_cost: formData.get("unit_cost"), date: formData.get("date"), note: formData.get("note") ?? "" });
  if (!parsed.success) redirect(`${back}?error=invalid`);
  const { error } = await supabase.from("stock_movements").insert({ business_id: profile.business_id, kind: "adjustment", ...parsed.data, unit_cost: parsed.data.unit_cost ?? null });
  if (error) redirect(`${back}?error=save`);
  ledgerChanged(profile.business_id);
  redirect(`${back}?saved=1`);
}

/**
 * The weekly buy buffer for one product, edited inline on Products (admin).
 * Empty goes back to the default for the unit: 5 for boxes, 0 for anything else.
 */
export async function saveProductBuffer(productId: string, raw: string): Promise<{ ok: boolean }> {
  if (!UUID.test(productId)) return { ok: false };
  const session = await requireSession();
  if (session.profile.role !== "admin") {
    await recordDenied(session, "product", productId);
    return { ok: false };
  }
  const trimmed = raw.trim();
  const value = trimmed === "" ? null : Number(trimmed);
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1000)) return { ok: false };
  const { error } = await session.supabase.from("products").update({ buffer_units: value }).eq("id", productId).eq("business_id", session.profile.business_id);
  if (error) return { ok: false };
  ledgerChanged(session.profile.business_id);
  return { ok: true };
}
