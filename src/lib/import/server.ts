import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyAgainstLedger, inferQuantity, mergeParsedPayouts, type ExistingOrder } from "@/lib/import/review";
import { matchProduct } from "@/lib/inventory/match";
import { expectedNetPerUnit, salePriceFor } from "@/lib/inventory/product-stats";
import { resolveQuantity } from "@/lib/inventory/quantity";
import { round2, todayIso } from "@/lib/money";
import { estimateNet } from "@/lib/parse/estimate";
import type { ParsedOrder, ParsedPayout, PayoutRow, ReviewRow, ReviewTag } from "@/lib/parse/schema";
import { proposeForAmount } from "@/lib/payouts/confirm";
import { num, type Person, type Platform, type PlatformSetting } from "@/lib/types";

export type ImportProduct = { id: string; name: string; variant: string; product_line: "sugar" | "skincare" | "other"; active: boolean; default_price: number; list_prices: Record<string, number>; expected_net_per_unit: number | null };
export type FeeSettings = Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[];

/** Products and platform fees the review needs, read once per import. */
export async function importContext(supabase: SupabaseClient, businessId: string): Promise<{ products: ImportProduct[]; settings: FeeSettings }> {
  const [{ data: settingsRows }, { data: productRows }] = await Promise.all([
    supabase.from("platform_settings").select("platform, commission_pct, fixed_fee"),
    supabase.from("products").select("id, name, variant, product_line, active, default_price, list_prices, expected_net_per_unit").eq("business_id", businessId).is("deleted_at", null),
  ]);
  return {
    products: (productRows ?? [])
      .filter((p) => p.active)
      .map((p) => ({ ...p, default_price: num(p.default_price), list_prices: (p.list_prices ?? {}) as Record<string, number>, expected_net_per_unit: p.expected_net_per_unit == null ? null : num(p.expected_net_per_unit) })),
    settings: (settingsRows ?? []).map((r) => ({ platform: r.platform as Platform, commission_pct: num(r.commission_pct), fixed_fee: num(r.fixed_fee) })),
  };
}

/** Live sales on the platform with these order numbers, keyed by order number. */
export async function existingOrders(supabase: SupabaseClient, businessId: string, platform: Platform, refs: string[]): Promise<Map<string, ExistingOrder>> {
  const out = new Map<string, ExistingOrder>();
  const unique = Array.from(new Set(refs.map((r) => r.trim()).filter(Boolean)));
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await supabase.from("transactions").select("id, order_ref, date, net_amount, status").eq("business_id", businessId).eq("type", "income").eq("platform", platform).in("order_ref", unique.slice(i, i + 200)).is("deleted_at", null);
    for (const row of data ?? []) if (row.order_ref) out.set(row.order_ref as string, { id: row.id as string, date: row.date as string, net_amount: num(row.net_amount), status: (row.status ?? "active") as ExistingOrder["status"] });
  }
  return out;
}

/**
 * Turns parsed orders into review rows: product match, quantity (explicit,
 * from the variant, or inferred from what you receive), the upload date when
 * none was read, an estimated net when the report had none, and what the row
 * means against the ledger. Every assumption becomes a gold tag.
 */
export function reviewRowsFor(orders: ParsedOrder[], platform: Platform, receivedBy: Person, ctx: { products: ImportProduct[]; settings: FeeSettings }, existing: Map<string, ExistingOrder>, uploadDate = todayIso()): ReviewRow[] {
  const fee = ctx.settings.find((s) => s.platform === platform)?.commission_pct ?? 0;
  return orders.map((order) => {
    const key = order.order_id?.trim() || null;
    const tags: ReviewTag[] = [];
    const resolved = resolveQuantity(order);
    const match = matchProduct(ctx.products, order.product_name, resolved.variant, order.note, order.product_line);
    const net = order.net_amount == null ? null : round2(order.net_amount);
    let qty = resolved.quantity;
    if (qty == null && match && net != null) {
      qty = inferQuantity(net, expectedNetPerUnit(match, fee));
      if (qty != null) tags.push("qty_inferred");
    }
    const listPrice = match ? salePriceFor(match, platform) : 0;
    const gross = order.gross_amount == null ? (listPrice > 0 && qty ? round2(listPrice * qty) : null) : round2(order.gross_amount);
    const netEstimated = net == null;
    if (netEstimated) tags.push("net_estimated");
    const dateOk = Boolean(order.date && /^\d{4}-\d{2}-\d{2}$/.test(order.date));
    if (!dateOk) tags.push("date_assumed");
    const ledger = classifyAgainstLedger(order.order_status, key ? (existing.get(key) ?? null) : null);
    return {
      ...order,
      order_id: key,
      date: dateOk ? order.date : uploadDate,
      gross_amount: gross,
      net_amount: net ?? (gross != null ? estimateNet(gross, platform, ctx.settings) : null),
      net_estimated: netEstimated,
      order_status: order.order_status ?? "active",
      key: crypto.randomUUID(),
      include: ledger.include,
      platform,
      received_by: receivedBy,
      quantity: qty,
      variant: resolved.variant,
      product_line: match?.product_line ?? order.product_line,
      product_id: match?.id ?? null,
      product_matched: Boolean(match),
      tags: [...tags, ...ledger.tags],
      existing: key ? (existing.get(key) ?? null) : null,
    };
  });
}

/** Payouts seen on wallet screens or in a finance export, each with the FIFO match it would make on confirm. */
export async function payoutRowsFor(supabase: SupabaseClient, businessId: string, payouts: ParsedPayout[], platform: Platform, receivedBy: Person, uploadDate = todayIso()): Promise<PayoutRow[]> {
  const out: PayoutRow[] = [];
  for (const p of mergeParsedPayouts(payouts)) {
    const { proposal, clawbackOffset } = await proposeForAmount(supabase, businessId, platform, p.amount);
    out.push({
      key: crypto.randomUUID(),
      include: true,
      date: p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : uploadDate,
      amount: round2(p.amount),
      platform,
      received_by: receivedBy,
      note: p.note ?? "",
      matched_orders: proposal.selectedIds.length,
      matched_total: proposal.total,
      clawback_offset: clawbackOffset,
    });
  }
  return out;
}
