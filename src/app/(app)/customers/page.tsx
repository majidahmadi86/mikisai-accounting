import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoTip } from "@/components/ui/InfoTip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { StackedItem, StackedList } from "@/components/ui/StackedList";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { OpenIcon } from "@/components/ui/Icons";
import { IconLink, RowDetail, Table, Td, Th } from "@/components/ui/Table";
import { CustomerNoteForm } from "@/components/customers/CustomerNoteForm";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone } from "@/lib/labels";
import { formatDate, round2, thb } from "@/lib/money";
import { num, type Customer } from "@/lib/types";

type Totals = { orders: number; gross: number; net: number; last: string | null };

export default async function CustomersPage() {
  const [{ supabase }, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);

  const [{ data: customers }, { data: incomes }] = await Promise.all([
    supabase.from("customers").select("*").is("deleted_at", null).order("name"),
    supabase.from("transactions").select("customer_name, gross_amount, net_amount, date").eq("type", "income").is("deleted_at", null).not("customer_name", "is", null),
  ]);

  const totals = new Map<string, Totals>();
  for (const row of incomes ?? []) {
    const key = (row.customer_name ?? "").trim().toLowerCase();
    if (!key) continue;
    const cur = totals.get(key) ?? { orders: 0, gross: 0, net: 0, last: null };
    cur.orders += 1;
    cur.gross = round2(cur.gross + num(row.gross_amount));
    cur.net = round2(cur.net + num(row.net_amount));
    if (!cur.last || row.date > cur.last) cur.last = row.date;
    totals.set(key, cur);
  }

  const rows = ((customers ?? []) as Customer[])
    .map((c) => ({ ...c, totals: totals.get(c.name.trim().toLowerCase()) ?? { orders: 0, gross: 0, net: 0, last: null } }))
    .sort((a, b) => b.totals.net - a.totals.net);

  return (
    <div>
      <PageHeader title={tr("customers.title")} subtitle={tr("customers.subtitle")} />
      {rows.length === 0 ? (
        <EmptyState title={tr("customers.empty")} body={tr("customers.emptyBody")} />
      ) : (
        <>
          <StackedList>
            {rows.map((c) => (
              <StackedItem key={c.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/transactions?customer=${encodeURIComponent(c.name)}`} className="block truncate text-base font-medium text-plum hover:text-berry hover:underline">
                      {c.name}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-plum-faint">
                      <Pill tone={platformTone(c.platform)}>{platformName(tr, c.platform)}</Pill>
                      <span>
                        {c.totals.orders} {tr("common.orders")}
                      </span>
                      {c.totals.last ? <span>· {formatDate(c.totals.last, locale)}</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium text-xl tabular text-plum">{thb(c.totals.net)}</p>
                    <p className="text-xs text-plum-faint tabular">{thb(c.totals.gross)}</p>
                  </div>
                </div>
                <div className="mt-3 border-t border-line pt-3">
                  <CustomerNoteForm id={c.id} note={c.note} />
                </div>
              </StackedItem>
            ))}
          </StackedList>

          <Table>
            <thead>
              <tr>
                <Th kind="long">{tr("common.customer")}</Th>
                <Th kind="pill" priority="secondary">
                  {tr("common.platform")}
                </Th>
                <Th kind="num">{tr("customers.orders")}</Th>
                <Th kind="money" priority="tertiary">
                  {tr("common.gross")}
                </Th>
                <Th kind="money">
                  <span className="inline-flex items-center gap-1">
                    {tr("customers.totalNet")} <InfoTip text={tr("customers.tipTotal")} />
                  </span>
                </Th>
                <Th kind="date" priority="secondary">
                  {tr("customers.lastOrder")}
                </Th>
                <Th kind="long">{tr("common.note")}</Th>
                <Th kind="action" icons={2}>
                  <span className="sr-only">{tr("table.showDetail")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <ExpandableRow
                  key={c.id}
                  label={c.name}
                  actions={
                    <IconLink href={`/transactions?customer=${encodeURIComponent(c.name)}`} label={tr("customers.orders")}>
                      <OpenIcon className="h-5 w-5" />
                    </IconLink>
                  }
                  detail={
                    <RowDetail
                      items={[
                        { label: tr("common.customer"), value: c.name, wide: true },
                        { label: tr("common.platform"), value: platformName(tr, c.platform), priority: "secondary" },
                        { label: tr("customers.lastOrder"), value: c.totals.last ? formatDate(c.totals.last, locale) : null, priority: "secondary" },
                        { label: tr("common.gross"), value: <span className="tabular">{thb(c.totals.gross)}</span>, priority: "tertiary" },
                      ]}
                    />
                  }
                >
                  <Td kind="long" className="font-medium text-plum" title={c.name}>
                    <Link href={`/transactions?customer=${encodeURIComponent(c.name)}`} className="hover:text-berry hover:underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td kind="pill" priority="secondary">
                    <Pill tone={platformTone(c.platform)}>{platformName(tr, c.platform)}</Pill>
                  </Td>
                  <Td kind="num">{c.totals.orders}</Td>
                  <Td kind="money" priority="tertiary" className="text-plum-soft">
                    {thb(c.totals.gross)}
                  </Td>
                  <Td kind="money" className="font-medium">
                    {thb(c.totals.net)}
                  </Td>
                  <Td kind="date" priority="secondary" className="text-plum-soft">
                    {c.totals.last ? formatDate(c.totals.last, locale) : ""}
                  </Td>
                  <Td>
                    <CustomerNoteForm id={c.id} note={c.note} />
                  </Td>
                </ExpandableRow>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
