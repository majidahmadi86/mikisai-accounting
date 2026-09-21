import "server-only";
import { revalidatePath, revalidateTag, unstable_cache, updateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExpenseCategory } from "@/lib/categories";
import type { Product, StockMovement } from "@/lib/inventory/valuation";
import type { TransactionItemRow } from "@/lib/inventory/reports";
import { num, type Business, type Clawback, type Customer, type ImportRun, type InternalTransfer, type Payout, type Person, type PlatformSetting, type SettlementStatus, type Transaction } from "@/lib/types";
import { normalizeLedger, type ClawbackLite } from "@/lib/truth";
import { walletState } from "@/lib/tiktok/wallet";
import { loadTiktokStatus } from "@/lib/tiktok/load-status";
import type { TiktokStatus } from "@/lib/tiktok/status";

export type LedgerTransaction = Transaction & {
  settlement: { status: SettlementStatus; settled_at: string | null; payout_id: string | null; paid_amount: number } | null;
};

export type StatementFactLite = { order_ref: string; kind: "order" | "refund"; transaction_id: string | null; settled_date: string | null; settlement_amount: number; fee_seller_shipping: number; chargeable_weight_g: number | null; boxes: number; overweight: boolean; pre_business: boolean; ledger_net_before: number | null };

export type TiktokMoney = {
  startDate: string;
  advanceBalance: number;
  disbursed: number;
  recovered: number;
  /** The balance spread over unsettled orders at 70% each: an estimate until they settle. */
  allocations: { order_ref: string; date: string; amount: number }[];
  advancePreBusiness: number;
  facts: StatementFactLite[];
  periods: { from: string; to: string }[];
};

export type LedgerSnapshot = {
  /** Active sales, refunded sales at what is left, every expense: what every number is built from. */
  transactions: LedgerTransaction[];
  /** Cancelled and refunded sales as recorded, kept apart for lists and Data health. */
  cancelled: LedgerTransaction[];
  clawbacks: ClawbackLite[];
  /** Cash that moved for cancelled orders and clawbacks; who-owes-whom and cash flow add these. */
  cashAdjustments: import("@/lib/reports/build").ReportTx[];
  transfers: InternalTransfer[];
  payouts: Payout[];
  settings: PlatformSetting[];
  customers: Customer[];
  categories: ExpenseCategory[];
  products: Product[];
  movements: StockMovement[];
  items: (TransactionItemRow & { id: string })[];
  business: Business;
  /** What last fed the ledger: a Seller Center file, shared screenshots or a quick order. */
  lastImport: ImportRun | null;
  /** The last run that fed TikTok orders from files or from the API, for the nightly routine. */
  lastTiktokImport: ImportRun | null;
  /** TikTok SKUs no product is mapped to yet. */
  skusAwaiting: { sku_key: string; sku_name: string }[];
  /** What payouts paid, per payout, from payout_allocations. */
  payoutCoverage: Record<string, number>;
  /** The TikTok Shop connection as the app may show it; never the tokens. */
  tiktok: TiktokStatus;
  /** What the TikTok Finance statements say: the advance still to be recovered, what each order really paid, the days covered. */
  tiktokMoney: TiktokMoney;
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
      const [tx, tr, po, ps, cu, bz, ec, pr, mv, it, cb, ir, nr, sk, pa, os, we, st, sd] = await Promise.all([
        admin
          .from("transactions")
          .select("*, settlements(status, settled_at, payout_id, paid_amount, deleted_at)")
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
        admin.from("stock_movements").select("id, product_id, qty, kind, unit_cost, transaction_id, date, created_at, created_by, note").eq("business_id", businessId).is("deleted_at", null).order("date").order("created_at"),
        admin.from("transaction_items").select("id, transaction_id, product_id, qty, unit_price, unit_cost").eq("business_id", businessId).is("deleted_at", null),
        admin.from("clawbacks").select("*").eq("business_id", businessId).is("deleted_at", null).order("created_at"),
        // A sale typed by hand is not an import: only files, screenshots and the API sync count.
        admin.from("import_runs").select("*").eq("business_id", businessId).neq("source", "quick").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("import_runs").select("*").eq("business_id", businessId).in("source", ["csv", "tiktok"]).order("ran_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("tiktok_sku_map").select("sku_key, sku_name").eq("business_id", businessId).is("product_id", null).order("created_at"),
        admin.from("payout_allocations").select("payout_id, amount").eq("business_id", businessId),
        admin.from("order_statements").select("order_ref, kind, transaction_id, settled_date, settlement_amount, fee_seller_shipping, chargeable_weight_g, boxes, overweight, pre_business, ledger_net_before").eq("business_id", businessId),
        admin.from("wallet_events").select("kind, reference, event_date, amount, bank_suffix, received_by").eq("business_id", businessId),
        admin.from("tiktok_statements").select("period_from, period_to").eq("business_id", businessId).order("period_from"),
        admin.from("businesses").select("start_date").eq("id", businessId).maybeSingle(),
      ]);

      const allTransactions: LedgerTransaction[] = (tx.data ?? []).map((row) => {
        // A settlement soft-deleted with its sale stays out of every number until the sale is restored.
        const list = Array.isArray(row.settlements) ? row.settlements : row.settlements ? [row.settlements] : [];
        const s = list.find((x: { deleted_at: string | null }) => !x.deleted_at) ?? null;
        const { settlements: _drop, ...rest } = row;
        void _drop;
        return {
          ...(rest as unknown as Transaction),
          gross_amount: num(row.gross_amount),
          net_amount: num(row.net_amount),
          quantity: num(row.quantity) || 1,
          status: (row.status ?? "active") as Transaction["status"],
          status_reason: row.status_reason ?? "",
          refund_amount: row.refund_amount == null ? null : num(row.refund_amount),
          tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
          settlement: s ? { status: s.status as SettlementStatus, settled_at: s.settled_at ?? null, payout_id: s.payout_id ?? null, paid_amount: num(s.paid_amount) } : null,
        };
      });
      const tiktok = await loadTiktokStatus(admin, businessId);
      const clawbacks: ClawbackLite[] = (cb.data ?? []).map((c) => ({ ...(c as Clawback), amount: num(c.amount) }));
      // The TikTok wallet, replayed from the stored statements: the advance balance and the advance cash that reached the bank.
      const facts: StatementFactLite[] = (os.data ?? []).map((f) => ({ order_ref: f.order_ref as string, kind: f.kind as "order" | "refund", transaction_id: (f.transaction_id as string | null) ?? null, settled_date: (f.settled_date as string | null) ?? null, settlement_amount: num(f.settlement_amount), fee_seller_shipping: num(f.fee_seller_shipping), chargeable_weight_g: f.chargeable_weight_g == null ? null : num(f.chargeable_weight_g), boxes: num(f.boxes) || 1, overweight: Boolean(f.overweight), pre_business: Boolean(f.pre_business), ledger_net_before: f.ledger_net_before == null ? null : num(f.ledger_net_before) }));
      const wallet = walletState({
        settled: facts.filter((f) => f.kind === "order" && f.settled_date).map((f) => ({ order_ref: f.order_ref, date: f.settled_date as string, net: f.settlement_amount, business: !f.pre_business })),
        losses: facts.filter((f) => f.kind === "refund" && f.settled_date && !f.pre_business && f.settlement_amount < 0).map((f) => ({ order_ref: f.order_ref, date: f.settled_date as string, loss: Math.abs(f.settlement_amount) })),
        events: (we.data ?? []).map((e) => ({ kind: e.kind as "earnings", reference: e.reference as string, date: e.event_date as string, amount: num(e.amount), bank_suffix: (e.bank_suffix as string) ?? "", received_by: e.received_by as Person })),
        unsettled: allTransactions.filter((t) => t.type === "income" && t.platform === "tiktok" && t.status === "active" && t.order_ref && (t.settlement?.status ?? "pending") === "pending").map((t) => ({ order_ref: t.order_ref as string, date: t.date, value: t.net_amount })),
      });
      const normalized = normalizeLedger(allTransactions, clawbacks, wallet.advanceCash);

      return {
        transactions: normalized.transactions,
        cancelled: normalized.cancelled,
        clawbacks,
        cashAdjustments: normalized.cashAdjustments,
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
        products: (pr.data ?? []).map((p) => ({ ...(p as Product), name_th: p.name_th ?? "", list_prices: (p.list_prices ?? {}) as Record<string, number>, photo_path: p.photo_path ?? null, notes: p.notes ?? "", stock_mode: (p.stock_mode ?? "buy_to_order") as Product["stock_mode"], short_name: p.short_name ?? "", expected_net_per_unit: p.expected_net_per_unit == null ? null : num(p.expected_net_per_unit), default_cost: num(p.default_cost), default_price: num(p.default_price), low_stock_threshold: num(p.low_stock_threshold) })),
        movements: (mv.data ?? []).map((m) => ({ ...(m as StockMovement), qty: num(m.qty), unit_cost: m.unit_cost == null ? null : num(m.unit_cost) })),
        items: (it.data ?? []).map((i) => ({ id: i.id as string, transaction_id: i.transaction_id as string, product_id: i.product_id as string, qty: num(i.qty), unit_price: num(i.unit_price), unit_cost: i.unit_cost == null ? null : num(i.unit_cost) })),
        business: { id: businessId, name: bz.data?.name ?? "MikiSai", exposure_limit: bz.data ? num(bz.data.exposure_limit) : 3000 },
        lastImport: ir.data ? (ir.data as ImportRun) : null,
        lastTiktokImport: nr.data ? (nr.data as ImportRun) : null,
        skusAwaiting: (sk.data ?? []) as { sku_key: string; sku_name: string }[],
        payoutCoverage: (pa.data ?? []).reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.payout_id as string]: Math.round(((acc[a.payout_id as string] ?? 0) + num(a.amount)) * 100) / 100 }), {}),
        tiktok,
        tiktokMoney: { startDate: (sd.data?.start_date as string | undefined) ?? "2026-09-15", advanceBalance: wallet.advanceBalance, disbursed: wallet.disbursed, recovered: wallet.recovered, allocations: wallet.allocations, advancePreBusiness: wallet.advancePreBusiness, facts, periods: (st.data ?? []).map((p) => ({ from: p.period_from as string, to: p.period_to as string })) },
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
