import { AddButton } from "@/components/nav/AddButton";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { TransactionList } from "@/components/transactions/TransactionList";
import { shortProductName, summariseItems } from "@/lib/inventory/units";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { categoryById, categoryLabel } from "@/lib/categories";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { num, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, TRANSACTION_TYPES, type SettlementStatus, type Transaction } from "@/lib/types";

type Filters = { type?: string; platform?: string; product?: string; status?: string; category?: string; from?: string; to?: string; product_id?: string; customer?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function pick<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const { supabase } = session;
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const categories = categoryById(snapshot.categories);
  const tr = t(locale);
  const productsById = new Map(snapshot.products.map((p) => [p.id, p]));
  const itemsByTx = new Map<string, { product_id: string; qty: number }[]>();
  for (const it of snapshot.items) itemsByTx.set(it.transaction_id, [...(itemsByTx.get(it.transaction_id) ?? []), it]);
  const itemsOf = (id: string) => summariseItems(itemsByTx.get(id) ?? [], productsById, locale, (n) => tr("transactions.items", { n }));

  const filters: Filters = {
    type: pick(sp.type, TRANSACTION_TYPES),
    platform: pick(sp.platform, PLATFORMS),
    product: pick(sp.product, PRODUCT_LINES),
    status: pick(sp.status, SETTLEMENT_STATUSES),
    category: typeof sp.category === "string" && UUID.test(sp.category) ? sp.category : undefined,
    from: typeof sp.from === "string" && ISO.test(sp.from) ? sp.from : undefined,
    to: typeof sp.to === "string" && ISO.test(sp.to) ? sp.to : undefined,
    product_id: typeof sp.product_id === "string" && UUID.test(sp.product_id) ? sp.product_id : undefined,
    customer: typeof sp.customer === "string" && sp.customer.trim() ? sp.customer.trim().slice(0, 200) : undefined,
  };
  const filtered = Boolean(filters.type || filters.platform || filters.product || filters.status || filters.category || filters.from || filters.to || filters.product_id || filters.customer);

  const select = filters.status ? "*, settlements!inner(status, payout_id, deleted_at)" : "*, settlements(status, payout_id, deleted_at)";
  let query = supabase.from("transactions").select(select).is("deleted_at", null).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (filters.status) query = query.is("settlements.deleted_at", null);
  if (filters.product_id) {
    // Rows carrying a line for this product; an empty list must return nothing, not everything.
    const ids = Array.from(new Set(snapshot.items.filter((i) => i.product_id === filters.product_id).map((i) => i.transaction_id)));
    query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  if (filters.customer) query = query.ilike("customer_name", filters.customer);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.product) query = query.eq("product_line", filters.product);
  if (filters.status) query = query.eq("settlements.status", filters.status);
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);

  const [{ data }, { data: profiles }] = await Promise.all([query, supabase.from("profiles").select("id, display_name")]);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  const byline = (row: { created_by: string | null; updated_by?: string | null }) => {
    const c = row.created_by ? nameOf.get(row.created_by) : null;
    const e = row.updated_by ? nameOf.get(row.updated_by) : null;
    if (!c && !e) return "";
    return [c ? tr("transactions.rowCreatedBy", { name: c }) : "", e && e !== c ? tr("transactions.rowEditedBy", { name: e }) : e && c ? tr("transactions.rowEditedBy", { name: e }) : ""].filter(Boolean).join(" · ");
  };
  const rows = (data ?? []).map((row) => {
    const list = Array.isArray(row.settlements) ? row.settlements : row.settlements ? [row.settlements] : [];
    const s = list.find((x: { deleted_at: string | null }) => !x.deleted_at) ?? null;
    return {
      ...(row as unknown as Transaction),
      gross_amount: num(row.gross_amount),
      net_amount: num(row.net_amount),
      quantity: num(row.quantity) || 1,
      status: (s?.status ?? null) as SettlementStatus | null,
    };
  });

  return (
    <div>
      <PageHeader
        title={tr("transactions.title")}
        subtitle={tr("transactions.subtitle")}
        action={
          <span className="hidden gap-2 md:flex">
            <AddButton label={tr("transactions.addExpense")} type="expense" variant="secondary" />
            <AddButton label={tr("transactions.addIncome")} type="income" />
          </span>
        }
      />

      <TransactionFilters tr={tr} filters={filters} />
      {filters.category ? (
        <p className="mb-3 text-xs text-plum-soft">
          {tr("common.category")}: <span className="font-medium text-plum">{categoryLabel(categories.get(filters.category), locale)}</span>
          {filters.from || filters.to ? ` · ${filters.from ?? ""} → ${filters.to ?? ""}` : ""}
        </p>
      ) : null}
      {filters.product_id ? <p className="mb-3 text-xs text-plum-soft">{tr("transactions.filterProduct", { name: productsById.get(filters.product_id) ? shortProductName(productsById.get(filters.product_id)!, locale) : "?" })}</p> : null}
      {filters.customer ? <p className="mb-3 text-xs text-plum-soft">{tr("transactions.filterCustomer", { name: filters.customer })}</p> : null}

      <p className="mb-3 text-xs text-plum-faint">{tr("transactions.count", { n: rows.length })}</p>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title={tr("transactions.empty")}
            body={tr("transactions.emptyBody")}
            action={
              <>
                <ButtonLink href="/transactions" variant="secondary">
                  {tr("transactions.clearFilters")}
                </ButtonLink>
                <AddButton label={tr("common.add")} />
              </>
            }
          />
        ) : (
          <EmptyState title={tr("transactions.emptyAll")} body={tr("transactions.emptyAllBody")} action={<AddButton label={tr("dashboard.addFirst")} />} />
        )
      ) : (
        <TransactionList rows={rows} tr={tr} locale={locale} categories={categories} itemsOf={itemsOf} byline={byline} />
      )}
    </div>
  );
}
