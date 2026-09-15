import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { Table, Td, Th } from "@/components/ui/Table";
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
    supabase.from("customers").select("*").order("name"),
    supabase.from("transactions").select("customer_name, gross_amount, net_amount, date").eq("type", "income").not("customer_name", "is", null),
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
        <EmptyState title={tr("customers.empty")} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{tr("common.customer")}</Th>
              <Th>{tr("common.platform")}</Th>
              <Th align="right">{tr("customers.orders")}</Th>
              <Th align="right">{tr("common.gross")}</Th>
              <Th align="right">{tr("customers.totalNet")}</Th>
              <Th>{tr("customers.lastOrder")}</Th>
              <Th>{tr("common.note")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium text-plum">{c.name}</Td>
                <Td>
                  <Pill tone={platformTone(c.platform)}>{platformName(tr, c.platform)}</Pill>
                </Td>
                <Td align="right">{c.totals.orders}</Td>
                <Td align="right" className="text-plum-soft">
                  {thb(c.totals.gross)}
                </Td>
                <Td align="right" className="font-medium">
                  {thb(c.totals.net)}
                </Td>
                <Td className="whitespace-nowrap text-plum-soft">{c.totals.last ? formatDate(c.totals.last, locale) : ""}</Td>
                <Td className="min-w-64">
                  <CustomerNoteForm id={c.id} note={c.note} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
