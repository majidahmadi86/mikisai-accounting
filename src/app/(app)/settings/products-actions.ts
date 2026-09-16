"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordDenied, requireAdmin, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { UUID } from "@/lib/soft-delete";
import { PRODUCT_LINES } from "@/lib/types";

const ProductSchema = z.object({
  name: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(80).default(""),
  product_line: z.enum(PRODUCT_LINES).default("other"),
  unit_label: z.string().trim().min(1).max(20).default("box"),
  default_cost: z.coerce.number().min(0).max(99_999_999).default(0),
  default_price: z.coerce.number().min(0).max(99_999_999).default(0),
  low_stock_threshold: z.coerce.number().int().min(0).max(100_000).default(3),
});

export type NewProductInput = z.input<typeof ProductSchema>;
export type ProductResult = { ok: true; id: string } | { ok: false; error: "invalid" | "save" };

/** Both roles may add a product (from Settings or inline in the quick-entry sheet). */
export async function createProduct(input: unknown): Promise<ProductResult> {
  const { supabase, profile } = await requireSession();
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { data, error } = await supabase.from("products").insert({ business_id: profile.business_id, ...parsed.data }).select("id").single();
  if (error || !data) return { ok: false, error: "save" };
  ledgerChanged(profile.business_id);
  return { ok: true, id: data.id };
}

export async function addProductForm(formData: FormData) {
  const result = await createProduct(Object.fromEntries(formData.entries()));
  redirect(result.ok ? "/settings?saved=1#products" : `/settings?error=${result.error}#products`);
}

/** Editing an existing product is admin only (RLS lets the author edit for 24 hours too, but Settings is the admin's page). */
export async function updateProduct(id: string, formData: FormData) {
  const session = await requireAdmin("product", id, "/settings?error=denied#products");
  const { supabase, profile } = session;
  if (!UUID.test(id)) redirect("/settings#products");
  const parsed = ProductSchema.extend({ active: z.coerce.boolean().default(true) }).safeParse({ ...Object.fromEntries(formData.entries()), active: formData.get("active") === "on" });
  if (!parsed.success) redirect("/settings?error=invalid#products");
  const { error, count } = await supabase.from("products").update(parsed.data, { count: "exact" }).eq("id", id).eq("business_id", profile.business_id).is("deleted_at", null);
  if (error) redirect("/settings?error=save#products");
  if (!count) {
    await recordDenied(session, "product", id, { attempted: "update" });
    redirect("/settings?error=denied#products");
  }
  ledgerChanged(profile.business_id);
  redirect("/settings?saved=1#products");
}

/** Manual stock correction, admin only: a positive or negative adjustment at an optional unit cost. */
export async function adjustStock(formData: FormData) {
  const { supabase, profile } = await requireAdmin("stock_movement", null, "/settings?error=denied#products");
  const parsed = z
    .object({ product_id: z.string().uuid(), qty: z.coerce.number().refine((n) => n !== 0), unit_cost: z.coerce.number().min(0).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(500).default("") })
    .safeParse({ product_id: formData.get("product_id"), qty: formData.get("qty"), unit_cost: formData.get("unit_cost") || undefined, date: formData.get("date"), note: formData.get("note") ?? "" });
  if (!parsed.success) redirect("/settings?error=invalid#products");
  const { error } = await supabase.from("stock_movements").insert({ business_id: profile.business_id, kind: "adjustment", ...parsed.data, unit_cost: parsed.data.unit_cost ?? null });
  if (error) redirect("/settings?error=save#products");
  ledgerChanged(profile.business_id);
  redirect("/settings?saved=1#products");
}
