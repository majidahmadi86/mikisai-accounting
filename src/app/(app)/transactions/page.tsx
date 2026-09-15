import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { Table, Td, Th } from "@/components/ui/Table";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { categoryName, platformName, platformTone, productName, statusName, statusTone } from "@/lib/labels";
import { formatDate, thb } from "@/lib/money";
import { num, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, TRANSACTION_TYPES, type SettlementStatus, type Transaction } from "@/lib/types";

type Filters = { type?: string; platform?: string; product?: string; status?: string };

function pick<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const [sp, { supabase }, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);

  const filters: Filters = {
    type: pick(sp.type, TRANSACTION_TYPES),
    platform: pick(sp.platform, PLATFORMS),
    product: pick(sp.product, PRODUCT_LINES),
    status: pick(sp.status, SETTLEMENT_STATUSES),
  };

  const select = filters.status ? "*, settlements!inner(status, payout_id)" : "*, settlements(status, payout_id)";
  let query = supabase.from("transactions").select(select).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.product) query = query.eq("product_line", filters.product);
  if (filters.status) query = query.eq("settlements.status", filters.status);

  const { data } = await query;
  const rows = (data ?? []).map((row) => {
    const s = Array.isArray(row.settlements) ? row.settlements[0] : row.settlements;
    return {
      ...(row as unknown as Transaction),
      gross_amount: num(row.gross_amount),
      net_amount: num(row.net_amount),
      status: (s?.status ?? null) as SettlementStatus | null,
    };
  });

  return (
    <div>
      <PageHeader
        title={tr("transactions.title")}
        subtitle={tr("transactions.subtitle")}
        action={
          <>
            <ButtonLink href="/transactions/new?type=expense" variant="secondary">
              {tr("transactions.addExpense")}
            </ButtonLink>
            <ButtonLink href="/transactions/new?type=income">{tr("transactions.addIncome")}</ButtonLink>
          </>
        }
      />

      <TransactionFilters tr={tr} filters={filters} />

      <p className="mb-3 text-xs text-ink-faint">{tr("transactions.count", { n: rows.length })}</p>

      {rows.length === 0 ? (
        <EmptyState title={tr("transactions.empty")} />
      ) : (
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
              <tr key={row.id} className="hover:bg-porcelain/60">
                <Td className="whitespace-nowrap">{formatDate(row.date, locale)}</Td>
                <Td>
                  <Pill tone={row.type === "income" ? "sage" : "clay"}>
                    {row.type === "income" ? tr("common.income") : tr("common.expense")}
                    <span className="ml-1 opacity-70">· {row.type === "income" ? tr(`common.${row.received_by ?? "mike"}`) : tr(`common.${row.payer ?? "mike"}`)}</span>
                  </Pill>
                </Td>
                <Td>
                  <Pill tone={platformTone(row.platform)}>{platformName(tr, row.platform)}</Pill>
                </Td>
                <Td className="text-ink-soft">{productName(tr, row.product_line)}</Td>
                <Td className="text-ink-soft max-w-48 truncate">
                  {row.type === "income" ? (row.customer_name ?? "") : row.category ? categoryName(tr, row.category) : ""}
                </Td>
                <Td align="right" className={row.type === "expense" ? "text-ink-faint" : ""}>
                  {row.type === "income" ? thb(row.gross_amount) : ""}
                </Td>
                <Td align="right" className={row.type === "expense" ? "text-clay font-medium" : "font-medium"}>
                  {row.type === "expense" ? `-${thb(row.net_amount)}` : thb(row.net_amount)}
                </Td>
                <Td>{row.status ? <Pill tone={statusTone(row.status)}>{statusName(tr, row.status)}</Pill> : null}</Td>
                <Td align="right">
                  <Link href={`/transactions/${row.id}/edit`} className="text-xs text-sage-deep hover:underline whitespace-nowrap">
                    {tr("common.edit")} →
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
