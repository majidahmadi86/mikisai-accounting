import Link from "next/link";
import { CopyRef } from "@/components/transactions/CopyRef";
import { OrderStatusButton } from "@/components/transactions/OrderStatusButton";
import { ItemsSummary } from "@/components/transactions/ItemsSummary";
import { Pill } from "@/components/ui/Pill";
import { StackedItem, StackedList } from "@/components/ui/StackedList";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { EditIcon } from "@/components/ui/Icons";
import { IconLink, RowDetail, Table, Td, Th } from "@/components/ui/Table";
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

/**
 * The ledger rows, as cards on phones and a table from md up. Shared by the Ledger page and Search.
 * Columns: date, type, product, buyer, you receive and status always; order ID and platform from
 * 1280px; customer paid from 1440px. The note, the byline and Mark cancelled live in the row detail.
 */
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
              </div>
              <div className="shrink-0 text-right">
                <p className={`tabular text-base font-medium ${row.type === "expense" ? "text-plum-soft" : "text-berry"}`}>
                  {row.type === "expense" ? "-" : "+"}
                  {thb(row.net_amount)}
                </p>
                {row.type === "income" && row.gross_amount !== row.net_amount ? <p className="text-xs text-plum-faint tabular">{thb(row.gross_amount)}</p> : null}
              </div>
            </Link>
            {row.type === "income" ? (
              <div className="px-4 pb-3">
                <OrderStatusButton id={row.id} status={row.status} refund={row.refund_amount} netAmount={row.net_amount} admin={admin} compact />
              </div>
            ) : null}
          </StackedItem>
        ))}
      </StackedList>

      <Table>
        <thead>
          <tr>
            <Th kind="date">{tr("common.date")}</Th>
            <Th kind="pill">{tr("common.type")}</Th>
            <Th kind="id" priority="secondary">
              {tr("transactions.orderRef")}
            </Th>
            <Th kind="pill" priority="secondary">
              {tr("common.platform")}
            </Th>
            <Th kind="long">{tr("common.product")}</Th>
            <Th kind="long">{tr("common.customer")}</Th>
            <Th kind="money" priority="tertiary">
              {tr("common.gross")}
            </Th>
            <Th kind="money">{tr("common.net")}</Th>
            <Th kind="status">{tr("common.status")}</Th>
            <Th kind="action" icons={2}>
              <span className="sr-only">{tr("table.showDetail")}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const items = itemsOf(row.id);
            const who = row.type === "income" ? tr(`common.${row.received_by ?? "mike"}`) : tr(`common.${row.payer ?? "mike"}`);
            const party = row.type === "income" ? (row.customer_name ?? "") : categoryLabel(categories.get(row.category_id ?? ""), locale);
            const productText = items ? items.label : row.type === "income" ? tr("transactions.noProduct") : productName(tr, row.product_line);
            return (
              <ExpandableRow
                key={row.id}
                label={row.order_ref ? `#${row.order_ref}` : party}
                actions={
                  <IconLink href={`/transactions/${row.id}/edit`} label={tr("common.edit")}>
                    <EditIcon className="h-5 w-5" />
                  </IconLink>
                }
                detail={
                  <RowDetail
                    items={[
                      { label: tr("transactions.orderRef"), value: row.order_ref ? <CopyRef value={row.order_ref} /> : null, priority: "secondary" },
                      { label: tr("common.platform"), value: platformName(tr, row.platform), priority: "secondary" },
                      { label: tr("common.gross"), value: row.type === "income" ? <span className="tabular">{thb(row.gross_amount)}</span> : null, priority: "tertiary" },
                      { label: tr("common.product"), value: items && items.lines.length > 1 ? items.lines.join(" · ") : null },
                      { label: tr("table.recorded"), value: byline(row) },
                      { label: tr("common.note"), value: row.note, wide: true },
                    ]}
                  >
                    {row.type === "income" ? (
                      <div className="mt-3">
                        <OrderStatusButton id={row.id} status={row.status} refund={row.refund_amount} netAmount={row.net_amount} admin={admin} compact />
                      </div>
                    ) : null}
                  </RowDetail>
                }
              >
                <Td kind="date">{formatDate(row.date, locale)}</Td>
                <Td kind="pill">
                  <Pill tone={typeTone(row.type)} className="max-w-full">
                    <span className="truncate">
                      {row.type === "income" ? tr("common.income") : tr("common.expense")}
                      <span className="ml-1 opacity-80">· {who}</span>
                    </span>
                  </Pill>
                </Td>
                <Td kind="id" priority="secondary">
                  {row.order_ref ? <CopyRef value={row.order_ref} /> : <span className="text-plum-faint">·</span>}
                </Td>
                <Td kind="pill" priority="secondary">
                  <Pill tone={platformTone(row.platform)}>{platformName(tr, row.platform)}</Pill>
                </Td>
                <Td className={items || row.type !== "income" ? "text-plum-soft" : "font-medium text-warning-ink"}>
                  <span className="block truncate" title={items ? items.lines.join(" · ") : productText}>
                    {productText}
                  </span>
                </Td>
                <Td className="text-plum-soft">
                  <span className="block truncate" title={party}>
                    {party}
                  </span>
                </Td>
                <Td kind="money" priority="tertiary" className="text-plum-faint">
                  {row.type === "income" ? thb(row.gross_amount) : ""}
                </Td>
                <Td kind="money" className={row.type === "expense" ? "font-medium text-plum-soft" : "font-medium text-berry"}>
                  {row.type === "expense" ? `-${thb(row.net_amount)}` : thb(row.net_amount)}
                </Td>
                <Td kind="status">
                  {row.type !== "income" ? null : row.status !== "active" ? (
                    <Pill tone="berry-soft">{row.status === "cancelled" ? tr("orders.cancelled") : tr("orders.refunded", { amount: thb(row.refund_amount ?? 0) })}</Pill>
                  ) : row.settlement_status ? (
                    <Pill tone={statusTone(row.settlement_status)}>{statusName(tr, row.settlement_status)}</Pill>
                  ) : null}
                </Td>
              </ExpandableRow>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
