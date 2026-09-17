import "server-only";
import { revalidatePath, revalidateTag, unstable_cache, updateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExpenseCategory } from "@/lib/categories";
import type { Product, StockMovement } from "@/lib/inventory/valuation";
import type { TransactionItemRow } from "@/lib/inventory/reports";
import { num, type Business, type Customer, type InternalTransfer, type Payout, type PlatformSetting, type SettlementStatus, type Transaction } from "@/lib/types";

export type LedgerTransaction = Transaction & {
  settlement: { status: SettlementStatus; settled_at: string | null; payout_id: string | null } | null;
};

export type LedgerSnapshot = {
  transactions: LedgerTransaction[];
  transfers: InternalTransfer[];
  payouts: Payout[];
  settings: PlatformSetting[];
  customers: Customer[];
  categories: ExpenseCategory[];
  products: Product[];
  movements: StockMovement[];
  items: (TransactionItemRow & { id: string })[];
  business: Business;
  fetchedAt: string;
};

export function ledgerTag(businessId: string): string {
  return `ledger:${businessId}`;
}

/**
 * One cached read of everything the dashboard, reports and insights need.
 * The business id comes from the verified session, so the service-role
 * client is safe here: every query is scoped by it explicitly. The cache is
 * tagged per business and expired by ledgerChanged() after every mutation.
 */
export async function getLedgerSnapshot(businessId: string): Promise<LedgerSnapshot> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      // Soft-deleted rows are hidden everywhere; only the Recently deleted list reads them.
      const [tx, tr, po, ps, cu, bz, ec, pr, mv, it] = await Promise.all([
        admin
          .from("transactions")
          .select("*, settlements(status, settled_at, payout_id)")
          .eq("business_id", businessId)
          .is("deleted_at", null)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
        admin.from("internal_transfers").select("*").eq("business_id", businessId).is("deleted_at", null).order("date", { ascending: false }).order("created_at", { ascending: false }),
        admin.from("payouts").select("*").eq("business_id", businessId).is("deleted_at", null).order("date", { ascending: false }).order("created_at", { ascending: false }),
        admin.from("platform_settings").select("*").eq("business_id", businessId),
        admin.from("customers").select("*").eq("business_id", businessId).is("deleted_at", null).order("name"),
        admin.from("businesses").select("id, name, exposure_limit").eq("id", businessId).maybeSingle(),
        admin.from("expense_categories").select("id, name_en, name_th, sort, active, stock_effect").eq("business_id", businessId).order("sort"),
        admin.from("products").select("*").eq("business_id", businessId).is("deleted_at", null).order("name"),
        admin.from("stock_movements").select("id, product_id, qty, kind, unit_cost, transaction_id, date, created_at").eq("business_id", businessId).order("date").order("created_at"),
        admin.from("transaction_items").select("id, transaction_id, product_id, qty, unit_price, unit_cost").eq("business_id", businessId),
      ]);

      const transactions: LedgerTransaction[] = (tx.data ?? []).map((row) => {
        const s = Array.isArray(row.settlements) ? row.settlements[0] : row.settlements;
        const { settlements: _drop, ...rest } = row;
        void _drop;
        return {
          ...(rest as unknown as Transaction),
          gross_amount: num(row.gross_amount),
          net_amount: num(row.net_amount),
          quantity: num(row.quantity) || 1,
          settlement: s ? { status: s.status as SettlementStatus, settled_at: s.settled_at ?? null, payout_id: s.payout_id ?? null } : null,
        };
      });

      return {
        transactions,
        transfers: (tr.data ?? []).map((r) => ({ ...(r as InternalTransfer), amount: num(r.amount) })),
        payouts: (po.data ?? []).map((r) => ({ ...(r as Payout), amount_received: num(r.amount_received) })),
        settings: (ps.data ?? []).map((r) => ({
          ...(r as PlatformSetting),
          commission_pct: num(r.commission_pct),
          fixed_fee: num(r.fixed_fee),
          settlement_lag_days: r.settlement_lag_days == null ? 10 : num(r.settlement_lag_days),
          daily_payout_pct: r.daily_payout_pct == null ? 100 : num(r.daily_payout_pct),
        })),
        customers: (cu.data ?? []) as Customer[],
        categories: (ec.data ?? []) as ExpenseCategory[],
        products: (pr.data ?? []).map((p) => ({ ...(p as Product), name_th: p.name_th ?? "", list_prices: (p.list_prices ?? {}) as Record<string, number>, photo_path: p.photo_path ?? null, notes: p.notes ?? "", stock_mode: (p.stock_mode ?? "buy_to_order") as Product["stock_mode"], short_name: p.short_name ?? "", default_cost: num(p.default_cost), default_price: num(p.default_price), low_stock_threshold: num(p.low_stock_threshold) })),
        movements: (mv.data ?? []).map((m) => ({ ...(m as StockMovement), qty: num(m.qty), unit_cost: m.unit_cost == null ? null : num(m.unit_cost) })),
        items: (it.data ?? []).map((i) => ({ id: i.id as string, transaction_id: i.transaction_id as string, product_id: i.product_id as string, qty: num(i.qty), unit_price: num(i.unit_price), unit_cost: i.unit_cost == null ? null : num(i.unit_cost) })),
        business: { id: businessId, name: bz.data?.name ?? "MikiSai", exposure_limit: bz.data ? num(bz.data.exposure_limit) : 3000 },
        fetchedAt: new Date().toISOString(),
      };
    },
    ["ledger-snapshot", businessId],
    // Writes made through the app expire the tag immediately. The short
    // revalidate is a safety net for changes made outside the app (SQL,
    // scripts such as reset:ledger), so the site never lags by more than a minute.
    { tags: [ledgerTag(businessId)], revalidate: 60 },
  )();
}

/**
 * Call after any write to the ledger. Expires the snapshot and every page
 * under the app layout. updateTag covers "use cache" entries; unstable_cache
 * entries (the snapshot) are only expired by revalidateTag, so both run.
 */
export function ledgerChanged(businessId: string): void {
  const tag = ledgerTag(businessId);
  updateTag(tag);
  revalidateTag(tag, "max");
  revalidatePath("/", "layout");
}
