import Link from "next/link";
import { CopyRef } from "@/components/transactions/CopyRef";
import { OrderStatusButton } from "@/components/transactions/OrderStatusButton";
import { ItemsSummary } from "@/components/transactions/ItemsSummary";
import { Pill } from "@/components/ui/Pill";
import { StackedItem, StackedList } from "@/components/ui/StackedList";
import { Table, Td, Th } from "@/components/ui/Table";
import type { ExpenseCategory } from "@/lib/categories";
import { categoryLabel } from "@/lib/categories";
import type { Locale, Translator } from "@/lib/i18n/dictionary";
import { platformName, platformTone, productName, statusName, statusTone, typeTone } from "@/lib/labels";
import { formatDate, thb } from "@/lib/money";
import type { ItemsSummary as ItemsSummaryData } from "@/lib/inventory/units";
import type { SettlementStatus, Transaction } from "@/lib/types";

export type LedgerRow = Transaction & { settlement_status: SettlementStatus | null };

export type TransactionListProps = {
  rows: LedgerRow[];
  tr: Translator;
  locale: Locale;
  categories: Map<string, ExpenseCategory>;
  itemsOf: (id: string) => ItemsSummaryData | null;
  byline: (row: { created_by: string | null; updated_by?: string | null }) => string;
  admin?: boolean;
};

/** The ledger rows, as cards on phones and a table from md up. Shared by the Ledger page and Search. */
export function TransactionList({ rows, tr, locale, categories, itemsOf, byline, admin = false }: TransactionListProps) {
  const title = (row: LedgerRow) => (row.type === "income" ? row.customer_name || platformName(tr, row.platform) : categoryLabel(categories.get(row.category_id ?? ""), locale) || tr("common.expense"));
  const product = (row: LedgerRow) => {
    const s = itemsOf(row.id);
    if (s) return <ItemsSummary label={s.label} lines={s.lines} />;
    return row.type === "income" ? <span className="font-medium text-warning-ink">{tr("transactions.noProduct")}</span> : productName(tr, row.product_line);
  };
  return (
    <>
      <StackedList>
        {rows.map((row) => (
          <StackedItem key={row.id} className="p-0">
            <Link href={`/transactions/${row.id}/edit`} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-plum">{title(row)}</p>
                <p className="mt-0.5 text-xs text-plum-faint">
                  {formatDate(row.date, locale)} · {row.type === "income" ? tr(`common.${row.received_by ?? "mike"}`) : tr(`common.${row.payer ?? "mike"}`)}
                </p>
                <p className="mt-0.5 text-xs text-plum-soft">{product(row)}</p>
                {row.order_ref ? (
                  <p className="mt-1">
                    <CopyRef value={row.order_ref} />
                  </p>
                ) : null}
                {row.note ? <p className="mt-0.5 line-clamp-1 text-xs text-plum-faint [overflow-wrap:anywhere]">{row.note}</p> : null}
                {byline(row) ? <p className="mt-0.5 text-[11px] text-plum-faint">{byline(row)}</p> : null}
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  <Pill tone={typeTone(row.type)}>{row.type === "income" ? tr("common.income") : tr("common.expense")}</Pill>
                  <Pill tone={platformTone(row.platform)}>{platformName(tr, row.platform)}</Pill>
                  {row.settlement_status && row.status === "active" ? <Pill tone={statusTone(row.settlement_status)}>{statusName(tr, row.settlement_status)}</Pill> : null}
                </p>
                {row.type === "income" ? (
                  <div className="mt-2">
                    <OrderStatusButton id={row.id} status={row.status} refund={row.refund_amount} netAmount={row.net_amount} admin={admin} compact />
                  </div>
                ) : null}
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
            <Th>{tr("transactions.orderRef")}</Th>
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
              <Td>{row.order_ref ? <CopyRef value={row.order_ref} /> : <span className="text-plum-faint">·</span>}</Td>
              <Td>
                <Pill tone={platformTone(row.platform)}>{platformName(tr, row.platform)}</Pill>
              </Td>
              <Td className="text-plum-soft">{product(row)}</Td>
              <Td className="max-w-56 text-plum-soft">
                <span className="block truncate">{row.type === "income" ? (row.customer_name ?? "") : categoryLabel(categories.get(row.category_id ?? ""), locale)}</span>
                {row.note ? <span className="block truncate text-xs text-plum-faint">{row.note}</span> : null}
                {byline(row) ? <span className="block truncate text-[11px] text-plum-faint">{byline(row)}</span> : null}
              </Td>
              <Td align="right" className="text-plum-faint">
                {row.type === "income" ? thb(row.gross_amount) : ""}
              </Td>
              <Td align="right" className={row.type === "expense" ? "font-medium text-plum-soft" : "font-medium text-berry"}>
                {row.type === "expense" ? `-${thb(row.net_amount)}` : thb(row.net_amount)}
              </Td>
              <Td>
                {row.type === "income" ? (
                  <span className="flex flex-col items-start gap-1">
                    {row.settlement_status && row.status === "active" ? <Pill tone={statusTone(row.settlement_status)}>{statusName(tr, row.settlement_status)}</Pill> : null}
                    <OrderStatusButton id={row.id} status={row.status} refund={row.refund_amount} netAmount={row.net_amount} admin={admin} compact />
                  </span>
                ) : null}
              </Td>
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
  );
}
