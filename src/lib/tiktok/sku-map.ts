import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkuSeen } from "./plan";

/** TikTok SKU to product: the one map the API sync and the file import share. A null product means awaiting mapping. */
export async function loadSkuMap(db: SupabaseClient, businessId: string): Promise<Map<string, string | null>> {
  const { data } = await db.from("tiktok_sku_map").select("sku_key, product_id").eq("business_id", businessId);
  return new Map((data ?? []).map((r) => [r.sku_key as string, (r.product_id as string | null) ?? null]));
}

/** SKUs a run met for the first time: remembered with the product a name match found, or empty for the admin to map. */
export async function rememberSkus(db: SupabaseClient, businessId: string, skus: SkuSeen[]): Promise<void> {
  if (!skus.length) return;
  await db.from("tiktok_sku_map").upsert(
    skus.map((s) => ({ business_id: businessId, sku_key: s.sku_key, sku_name: s.sku_name.slice(0, 300), product_id: s.product_id, learned: s.learned })),
    { onConflict: "business_id,sku_key", ignoreDuplicates: true },
  );
}

/** Platform payment ids already recorded as payouts, so the same payment is never recorded twice. */
export async function knownPaymentIds(db: SupabaseClient, businessId: string, platform: string): Promise<Set<string>> {
  const { data } = await db.from("payouts").select("external_ref").eq("business_id", businessId).eq("platform", platform).not("external_ref", "is", null).is("deleted_at", null);
  return new Set((data ?? []).map((r) => r.external_ref as string));
}
