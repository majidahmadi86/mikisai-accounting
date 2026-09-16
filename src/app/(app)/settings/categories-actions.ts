"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { UUID } from "@/lib/soft-delete";
import { STOCK_EFFECTS } from "@/lib/categories";

const Name = z.string().trim().min(1).max(60);

/** All category changes are admin only (RLS agrees) and audited by the expense_categories trigger. */
export async function addCategory(formData: FormData) {
  const { supabase, profile } = await requireAdmin("expense_category", null, "/settings?error=denied");
  const parsed = z.object({ name_en: Name, name_th: Name }).safeParse({ name_en: formData.get("name_en"), name_th: formData.get("name_th") });
  if (!parsed.success) redirect("/settings?error=invalid#categories");
  const { data: last } = await supabase.from("expense_categories").select("sort").eq("business_id", profile.business_id).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("expense_categories").insert({ business_id: profile.business_id, ...parsed.data, sort: (last?.sort ?? 0) + 10, active: true });
  if (error) redirect("/settings?error=save#categories");
  ledgerChanged(profile.business_id);
  redirect("/settings?saved=1#categories");
}

export async function renameCategory(id: string, formData: FormData) {
  const { supabase, profile } = await requireAdmin("expense_category", id, "/settings?error=denied");
  if (!UUID.test(id)) redirect("/settings");
  const parsed = z.object({ name_en: Name, name_th: Name, stock_effect: z.enum(STOCK_EFFECTS).default("none") }).safeParse({ name_en: formData.get("name_en"), name_th: formData.get("name_th"), stock_effect: formData.get("stock_effect") ?? "none" });
  if (!parsed.success) redirect("/settings?error=invalid#categories");
  const { error } = await supabase.from("expense_categories").update(parsed.data).eq("id", id).eq("business_id", profile.business_id);
  if (error) redirect("/settings?error=save#categories");
  ledgerChanged(profile.business_id);
  redirect("/settings?saved=1#categories");
}

/** Deactivated categories stay on old records and disappear from the chips. */
export async function setCategoryActive(id: string, active: boolean) {
  const { supabase, profile } = await requireAdmin("expense_category", id, "/settings?error=denied");
  if (!UUID.test(id)) redirect("/settings");
  await supabase.from("expense_categories").update({ active }).eq("id", id).eq("business_id", profile.business_id);
  ledgerChanged(profile.business_id);
  redirect("/settings#categories");
}

/** Swaps sort with the neighbour above or below. */
export async function moveCategory(id: string, direction: "up" | "down") {
  const { supabase, profile } = await requireAdmin("expense_category", id, "/settings?error=denied");
  if (!UUID.test(id)) redirect("/settings");
  const { data: all } = await supabase.from("expense_categories").select("id, sort").eq("business_id", profile.business_id).order("sort");
  const list = all ?? [];
  const i = list.findIndex((c) => c.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < list.length) {
    // Re-number everything in tens so ties can never appear.
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    await Promise.all(reordered.map((c, idx) => supabase.from("expense_categories").update({ sort: (idx + 1) * 10 }).eq("id", c.id).eq("business_id", profile.business_id)));
    ledgerChanged(profile.business_id);
  }
  redirect("/settings#categories");
}
