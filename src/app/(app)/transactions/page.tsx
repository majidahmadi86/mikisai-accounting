import Link from "next/link";
import { AddButton } from "@/components/nav/AddButton";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { StackedItem, StackedList } from "@/components/ui/StackedList";
import { Table, Td, Th } from "@/components/ui/Table";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { ItemsSummary } from "@/components/transactions/ItemsSummary";
import { summariseItems } from "@/lib/inventory/units";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone, productName, statusName, statusTone, typeTone } from "@/lib/labels";
import { categoryById, categoryLabel } from "@/lib/categories";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { formatDate, thb } from "@/lib/money";
import { num, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, TRANSACTION_TYPES, type SettlementStatus, type Transaction } from "@/lib/types";

type Filters = { type?: string; platform?: string; product?: string; status?: string; category?: string; from?: string; to?: string };
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
  };
  const filtered = Boolean(filters.type || filters.platform || filters.product || filters.status || filters.category || filters.from || filters.to);

  const select = filters.status ? "*, settlements!inner(status, payout_id)" : "*, settlements(status, payout_id)";
  let query = supabase.from("transactions").select(select).is("deleted_at", null).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.product) query = query.eq("product_line", filters.product);
  if (filters.status) query = query.eq("settlements.status", filters.status);
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);

  const { data } = await query;
  const rows = (data ?? []).map((row) => {
    const s = Array.isArray(row.settlements) ? row.settlements[0] : row.settlements;
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
        <>
          <StackedList>
            {rows.map((row) => (
              <StackedItem key={row.id} className="p-0">
                <Link href={`/transactions/${row.id}/edit`} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium text-plum">
                      {row.type === "income" ? row.customer_name || platformName(tr, row.platform) : categoryLabel(categories.get(row.category_id ?? ""), locale) || tr("common.expense")}
                    </p>
                    <p className="mt-0.5 text-xs text-plum-faint">
                      {formatDate(row.date, locale)} · {row.type === "income" ? tr(`common.${row.received_by ?? "mike"}`) : tr(`common.${row.payer ?? "mike"}`)}
                    </p>
                    <p className="mt-0.5 text-xs text-plum-soft">
                      {(() => {
                        const s = itemsOf(row.id);
                        if (s) return <ItemsSummary label={s.label} lines={s.lines} />;
                        return row.type === "income" ? <span className="font-medium text-warning-ink">{tr("transactions.noProduct")}</span> : productName(tr, row.product_line);
                      })()}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      <Pill tone={typeTone(row.type)}>{row.type === "income" ? tr("common.income") : tr("common.expense")}</Pill>
                      <Pill tone={platformTone(row.platform)}>{platformName(tr, row.platform)}</Pill>
                      {row.status ? <Pill tone={statusTone(row.status)}>{statusName(tr, row.status)}</Pill> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`tabular text-base font-medium ${row.type === "expense" ? "text-plum-soft" : "text-berry"}`}>
                      {row.type === "expense" ? "-" : "+"}
                      {thb(row.net_amount)}
                    </p>
                    {row.type === "income" && row.gross_amount !== row.net_amount ? <p className="text-xs text-plum-faint tabular">{thb(row.gross_amount)}</p> : null}
                  </div>
                </Link>
              </StackedItem>
            ))}
          </StackedList>

          <Table>
            <thead>
              <tr>
                <Th>{tr("common.date")}</Th>
                <Th>{tr("common.type")}</Th>
                <Th>{tr("common.platform")}</Th>
                <Th>{tr("common.product")}</Th>
                <Th>{tr("common.customer")}</Th>
                <Th align="right">{tr("common.gross")}</Th>
                <Th align="right">{tr("common.net")}</Th>
                <Th>{tr("common.status")}</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-lavender-tint">
                  <Td className="whitespace-nowrap">{formatDate(row.date, locale)}</Td>
                  <Td>
                    <Pill tone={typeTone(row.type)}>
                      {row.type === "income" ? tr("common.income") : tr("common.expense")}
                      <span className="ml-1 opacity-80">· {row.type === "income" ? tr(`common.${row.received_by ?? "mike"}`) : tr(`common.${row.payer ?? "mike"}`)}</span>
                    </Pill>
                  </Td>
                  <Td>
                    <Pill tone={platformTone(row.platform)}>{platformName(tr, row.platform)}</Pill>
                  </Td>
                  <Td className="text-plum-soft">
                    {(() => {
                      const s = itemsOf(row.id);
                      if (s) return <ItemsSummary label={s.label} lines={s.lines} />;
                      return row.type === "income" ? <span className="font-medium text-warning-ink">{tr("transactions.noProduct")}</span> : productName(tr, row.product_line);
                    })()}
                  </Td>
                  <Td className="max-w-48 truncate text-plum-soft">{row.type === "income" ? (row.customer_name ?? "") : categoryLabel(categories.get(row.category_id ?? ""), locale)}</Td>
                  <Td align="right" className="text-plum-faint">
                    {row.type === "income" ? thb(row.gross_amount) : ""}
                  </Td>
                  <Td align="right" className={row.type === "expense" ? "font-medium text-plum-soft" : "font-medium text-berry"}>
                    {row.type === "expense" ? `-${thb(row.net_amount)}` : thb(row.net_amount)}
                  </Td>
                  <Td>{row.status ? <Pill tone={statusTone(row.status)}>{statusName(tr, row.status)}</Pill> : null}</Td>
                  <Td align="right">
                    <Link href={`/transactions/${row.id}/edit`} className="text-xs text-berry hover:underline whitespace-nowrap">
                      {tr("common.edit")} →
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
