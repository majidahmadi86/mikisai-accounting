import Link from "next/link";
import { createTransfer } from "@/app/(app)/transfers/actions";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { EditIcon } from "@/components/ui/Icons";
import { IconLink, RowDetail, Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { categoryLabel } from "@/lib/categories";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { buildInvestment } from "@/lib/investment";
import { formatDate, thb, todayIso } from "@/lib/money";
import { cn } from "@/lib/cn";

export default async function InvestmentPage({ searchParams }: PageProps<"/investment">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const today = todayIso();
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const inv = buildInvestment(snapshot, today, locale, { category: (c) => categoryLabel(c, locale) || tr("common.expense"), reason: (r) => tr(`transfer.reason.${r}`) });
  const who = (p: "mike" | "sai") => tr(`common.${p}`);

  return (
    <div className="max-w-4xl">
      <PageHeader title={tr("investment.title")} subtitle={tr("investment.subtitle")} />
      {sp.transfer === "saved" ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("common.saved")}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-ivory-deep/70 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">{tr("investment.total")}</p>
            <InfoTip text={tr("investment.totalHint")} />
          </div>
          <p className="mt-1 text-2xl font-medium tabular text-plum">{thb(inv.total)}</p>
        </div>
        {(["mike", "sai"] as const).map((p) => (
          <div key={p} className="rounded-xl bg-ivory-deep/70 px-4 py-3">
            <p className="eyebrow">{tr("investment.putIn", { name: who(p) })}</p>
            <p className="mt-1 text-2xl font-medium tabular text-plum">{thb(inv.byPerson[p])}</p>
          </div>
        ))}
        <div className="rounded-xl bg-ivory-deep/70 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">{tr("investment.fairShare")}</p>
            <InfoTip text={tr("investment.fairShareHint")} />
          </div>
          <p className="mt-1 text-2xl font-medium tabular text-plum">{thb(inv.fairShare)}</p>
        </div>
      </div>

      <Card tone={inv.settle ? "lavender" : "success"} className="mt-4 px-5 py-5">
        {inv.settle ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">{tr("investment.toBeEqual")}</p>
              <p className="mt-1 text-xl font-medium text-plum">{tr("investment.owes", { from: who(inv.settle.from), to: who(inv.settle.to), amount: thb(inv.settle.amount) })}</p>
              <p className="mt-1 text-xs text-plum-soft">{tr("investment.alreadyCounted")}</p>
              <p className="mt-1 text-xs text-plum-faint">{tr("investment.owesHint")}</p>
            </div>
            <form action={createTransfer}>
              <input type="hidden" name="date" value={today} />
              <input type="hidden" name="from_person" value={inv.settle.from} />
              <input type="hidden" name="to_person" value={inv.settle.to} />
              <input type="hidden" name="amount" value={inv.settle.amount} />
              <input type="hidden" name="reason" value="my_half_of_costs" />
              <input type="hidden" name="note" value={tr("investment.recordNote")} />
              <input type="hidden" name="redirect_to" value="/investment" />
              <Button type="submit">{tr("investment.record", { amount: thb(inv.settle.amount) })}</Button>
            </form>
          </div>
        ) : (
          <p className="text-lg font-medium text-success">{tr("investment.equal")}</p>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title={tr("investment.returns")} subtitle={tr("investment.returnsDesc")} />
        <dl className="grid grid-cols-3 gap-3 px-5 pb-5 sm:px-6 sm:pb-6">
          <div>
            <dt className="eyebrow">{tr("investment.cashReceived")}</dt>
            <dd className="mt-1 text-xl font-medium tabular text-plum">{thb(inv.returns.cashReceived)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{tr("reports.bsProfitToDate")}</dt>
            <dd className={cn("mt-1 text-xl font-medium tabular", inv.returns.profitToDate >= 0 ? "text-success" : "text-berry")}>{thb(inv.returns.profitToDate)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{tr("investment.pending")}</dt>
            <dd className="mt-1 text-xl font-medium tabular text-plum">{thb(inv.returns.pending)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title={tr("investment.list")} subtitle={tr("investment.listDesc")} />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {inv.contributions.length === 0 ? (
            <p className="text-sm text-plum-soft">{tr("investment.none")}</p>
          ) : (
            <>
              <ul className="space-y-2 lg:hidden">
                {inv.contributions.map((c) => (
                  <li key={c.id}>
                    <Link href={c.href} className="block rounded-xl border border-line bg-card px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-plum">
                          {who(c.who)} · {c.label}
                        </span>
                        <span className="shrink-0 tabular font-medium text-plum">{thb(c.amount)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-plum-faint [overflow-wrap:anywhere]">
                        {formatDate(c.date, locale)}
                        {c.details ? ` · ${c.details}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-plum-soft">
                        {tr("investment.running", { name: who(c.who), amount: thb(c.running) })} <Pill tone={c.kind === "capital" ? "lavender" : "neutral"}>{c.kind === "capital" ? tr("investment.capital") : tr("common.expense")}</Pill>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              <Table>
                <thead>
                  <tr>
                    <Th kind="date">{tr("common.date")}</Th>
                    <Th kind="num" align="left">
                      {tr("investment.who")}
                    </Th>
                    <Th kind="status">{tr("investment.reason")}</Th>
                    <Th kind="long">{tr("investment.details")}</Th>
                    <Th kind="money">{tr("common.amount")}</Th>
                    <Th kind="money" priority="secondary">
                      {tr("investment.runningShort")}
                    </Th>
                    <Th kind="action" icons={2}>
                      <span className="sr-only">{tr("table.showDetail")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {inv.contributions.map((c) => (
                    <ExpandableRow
                      key={c.id}
                      label={`${formatDate(c.date, locale)} ${c.label}`}
                      actions={
                        <IconLink href={c.href} label={tr("common.edit")}>
                          <EditIcon className="h-5 w-5" />
                        </IconLink>
                      }
                      detail={
                        <RowDetail
                          items={[
                            { label: tr("investment.reason"), value: c.label },
                            { label: tr("investment.runningShort"), value: <span className="tabular">{thb(c.running)}</span>, priority: "secondary" },
                            { label: tr("investment.details"), value: c.details, wide: true },
                          ]}
                        />
                      }
                    >
                      <Td kind="date">{formatDate(c.date, locale)}</Td>
                      <Td kind="num" align="left" className="text-plum">
                        {who(c.who)}
                      </Td>
                      <Td kind="status">
                        <Pill tone={c.kind === "capital" ? "lavender" : "neutral"} className="max-w-full">
                          <span className="truncate" title={c.label}>
                            {c.label}
                          </span>
                        </Pill>
                      </Td>
                      <Td kind="long" className="text-plum-soft">
                        {c.details ?? ""}
                      </Td>
                      <Td kind="money" className="font-medium">
                        {thb(c.amount)}
                      </Td>
                      <Td kind="money" priority="secondary" className="text-plum-soft">
                        {thb(c.running)}
                      </Td>
                    </ExpandableRow>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
