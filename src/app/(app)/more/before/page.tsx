import { EmptyState } from "@/components/ui/EmptyState";
import { DownloadIcon } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { StackedItem, StackedList, StackedRow } from "@/components/ui/StackedList";
import { Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDate, round2, thb } from "@/lib/money";
import { num } from "@/lib/types";

/**
 * Before MikiSai: TikTok orders created before the business began. Read-only.
 * They are kept so a statement still adds up, and they are in no business
 * number: they never become ledger rows, stock, cash or profit.
 */
export default async function BeforePage() {
  const [{ supabase, profile }, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);
  const [{ data: biz }, { data }] = await Promise.all([
    supabase.from("businesses").select("start_date").eq("id", profile.business_id).maybeSingle(),
    supabase.from("order_statements").select("order_ref, kind, created_date, settled_date, settlement_amount, revenue, boxes").eq("business_id", profile.business_id).eq("pre_business", true).order("settled_date", { ascending: false }),
  ]);
  const rows = (data ?? []).map((r) => ({ order_ref: r.order_ref as string, kind: r.kind as string, created: r.created_date as string | null, settled: r.settled_date as string | null, amount: num(r.settlement_amount), revenue: num(r.revenue), boxes: num(r.boxes) }));
  const total = round2(rows.reduce((a, r) => a + r.amount, 0));
  const start = (biz?.start_date as string | undefined) ?? "2026-09-15";

  return (
    <div>
      <PageHeader
        title={tr("before.title")}
        subtitle={tr("before.subtitle", { date: formatDate(start, locale) })}
        action={
          rows.length ? (
            <a href="/more/before/export" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-medium text-plum hover:border-berry hover:text-berry">
              <DownloadIcon className="h-4 w-4" /> {tr("before.export")}
            </a>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState title={tr("before.empty")} />
      ) : (
        <>
          <p className="mb-3 text-xs text-plum-faint">{tr("before.total", { n: rows.length, amount: thb(total) })}</p>
          <StackedList>
            {rows.map((r) => (
              <StackedItem key={`${r.order_ref}:${r.kind}`}>
                <p className="truncate font-mono text-xs text-plum">#{r.order_ref}</p>
                <StackedRow label={tr("before.created")}>{r.created ? formatDate(r.created, locale) : "·"}</StackedRow>
                <StackedRow label={tr("before.settled")}>{r.settled ? formatDate(r.settled, locale) : "·"}</StackedRow>
                <StackedRow label={tr("before.amount")}>
                  <span className="tabular font-medium">{thb(r.amount)}</span>
                </StackedRow>
              </StackedItem>
            ))}
          </StackedList>
          <Table>
            <thead>
              <tr>
                <Th kind="long">{tr("transactions.orderRef")}</Th>
                <Th kind="date">{tr("before.created")}</Th>
                <Th kind="date">{tr("before.settled")}</Th>
                <Th kind="num">{tr("before.boxes")}</Th>
                <Th kind="money">{tr("before.revenue")}</Th>
                <Th kind="money">{tr("before.amount")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.order_ref}:${r.kind}`}>
                  <Td className="truncate font-mono text-xs" title={r.order_ref}>
                    #{r.order_ref}
                  </Td>
                  <Td kind="date">{r.created ? formatDate(r.created, locale) : ""}</Td>
                  <Td kind="date">{r.settled ? formatDate(r.settled, locale) : ""}</Td>
                  <Td kind="num">{r.boxes}</Td>
                  <Td kind="money" className="text-plum-soft">
                    {thb(r.revenue)}
                  </Td>
                  <Td kind="money" className="font-medium">
                    {thb(r.amount)}
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
