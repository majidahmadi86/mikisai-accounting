import { TransactionList, type LedgerRow } from "@/components/transactions/TransactionList";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchIcon } from "@/components/ui/Icons";
import { requireSession } from "@/lib/auth";
import { categoryById } from "@/lib/categories";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { summariseItems } from "@/lib/inventory/units";
import { num, type SettlementStatus, type Transaction } from "@/lib/types";

/** Global search over the ledger: order id, customer, amount or a word from a note. */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const categories = categoryById(snapshot.categories);
  const productsById = new Map(snapshot.products.map((p) => [p.id, p]));
  const itemsByTx = new Map<string, { product_id: string; qty: number }[]>();
  for (const it of snapshot.items) itemsByTx.set(it.transaction_id, [...(itemsByTx.get(it.transaction_id) ?? []), it]);
  const itemsOf = (id: string) => summariseItems(itemsByTx.get(id) ?? [], productsById, locale, (n) => tr("transactions.items", { n }));

  let rows: LedgerRow[] = [];
  if (q) {
    const { supabase } = session;
    const safe = q.replace(/[%,()]/g, " ").trim();
    const amount = Number(q.replace(/[,฿\s]/g, ""));
    const clauses = [`order_ref.ilike.%${safe}%`, `customer_name.ilike.%${safe}%`, `note.ilike.%${safe}%`];
    if (Number.isFinite(amount) && amount > 0) clauses.push(`net_amount.eq.${amount}`, `gross_amount.eq.${amount}`);
    const { data } = await supabase.from("transactions").select("*, settlements(status, deleted_at)").is("deleted_at", null).or(clauses.join(",")).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
    rows = (data ?? []).map((row) => {
      const list: { status: string; deleted_at: string | null }[] = Array.isArray(row.settlements) ? row.settlements : row.settlements ? [row.settlements] : [];
      const s = list.find((x) => !x.deleted_at) ?? null;
      return { ...(row as unknown as Transaction), gross_amount: num(row.gross_amount), net_amount: num(row.net_amount), quantity: num(row.quantity) || 1, settlement_status: (s?.status ?? null) as SettlementStatus | null, status: (row.status ?? "active") as Transaction["status"], refund_amount: row.refund_amount == null ? null : num(row.refund_amount) };
    });
  }
  const { data: profiles } = await session.supabase.from("profiles").select("id, display_name");
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  const byline = (row: { created_by: string | null; updated_by?: string | null }) => {
    const c = row.created_by ? nameOf.get(row.created_by) : null;
    const e = row.updated_by ? nameOf.get(row.updated_by) : null;
    if (!c && !e) return "";
    return [c ? tr("transactions.rowCreatedBy", { name: c }) : "", e ? tr("transactions.rowEditedBy", { name: e }) : ""].filter(Boolean).join(" · ");
  };

  return (
    <div>
      <PageHeader title={tr("search.title")} subtitle={tr("search.hint")} />
      <form role="search" action="/search" method="get" className="mb-5">
        <label className="relative block max-w-xl">
          <span className="sr-only">{tr("search.title")}</span>
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-plum-faint">
            <SearchIcon className="h-5 w-5" />
          </span>
          <input type="search" name="q" defaultValue={q} placeholder={tr("search.placeholder")} autoFocus={!q} className="min-h-12 w-full rounded-2xl border border-line bg-card pl-12 pr-4 text-base text-plum placeholder:text-plum-faint focus:border-berry focus:outline-none focus:ring-2 focus:ring-lavender" />
        </label>
      </form>
      {q ? <p className="mb-3 text-xs text-plum-faint">{tr("search.results", { n: rows.length, q })}</p> : null}
      {q && rows.length === 0 ? <EmptyState title={tr("search.none")} /> : null}
      {rows.length ? <TransactionList rows={rows} tr={tr} locale={locale} categories={categories} itemsOf={itemsOf} byline={byline} admin={session.profile.role === "admin"} /> : null}
    </div>
  );
}
