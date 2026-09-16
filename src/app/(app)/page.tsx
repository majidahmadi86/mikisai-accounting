import Link from "next/link";
import { BalanceBanner } from "@/components/dashboard/BalanceBanner";
import { AddButton } from "@/components/nav/AddButton";
import { Tour } from "@/components/tour/Tour";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SoftDeleteButton } from "@/components/ui/SoftDeleteButton";
import { TransferForm } from "@/components/transfers/TransferForm";
import { InfoTip } from "@/components/ui/InfoTip";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { requireSession } from "@/lib/auth";
import { computeBalance } from "@/lib/balance";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone, statusName, statusTone } from "@/lib/labels";
import { formatDate, thb } from "@/lib/money";
import { PLATFORMS } from "@/lib/types";
import { createTransfer } from "./transfers/actions";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const admin = session.profile.role === "admin";

  const balance = computeBalance(
    snapshot.transactions.map((tx) => ({ type: tx.type, platform: tx.platform, net_amount: tx.net_amount, payer: tx.payer, received_by: tx.received_by, settlement_status: tx.settlement?.status ?? null })),
    snapshot.transfers,
  );
  const recent = snapshot.transactions.slice(0, 8);
  const transfers = snapshot.transfers.slice(0, 20);
  const pendingPlatforms = PLATFORMS.filter((p) => balance.pendingByPlatform[p].orders > 0);
  const transferError = typeof sp.transfer === "string" ? sp.transfer : null;
  const empty = snapshot.transactions.length === 0;

  return (
    <div>
      <Tour autoOpen />
      <BalanceBanner balance={balance} tr={tr} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={tr("dashboard.settledIncome")} value={thb(balance.settledIncome)} tone="berry" info={<InfoTip text={tr("tips.settledIncome")} />} />
        <StatCard label={tr("dashboard.expenses")} value={thb(balance.expenses)} info={<InfoTip text={tr("tips.expenses")} />} />
        <StatCard label={tr("dashboard.netProfit")} value={thb(balance.netProfit)} info={<InfoTip text={tr("tips.netProfit")} />} />
        <StatCard label={tr("dashboard.share")} value={thb(balance.target)} hint="50 / 50" info={<InfoTip text={tr("tips.share")} />} />
      </div>

      <div className="mb-6 grid gap-4 sm:gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title={tr("dashboard.pendingTitle")} subtitle={tr("dashboard.pendingSubtitle")} action={<InfoTip text={tr("tips.pending")} />} />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {pendingPlatforms.length === 0 ? (
              <p className="text-sm text-plum-soft">{tr("dashboard.pendingNone")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {pendingPlatforms.map((p) => {
                  const b = balance.pendingByPlatform[p];
                  return (
                    <li key={p} className="flex items-center justify-between py-3">
                      <div>
                        <Pill tone={platformTone(p)}>{platformName(tr, p)}</Pill>
                        <p className="mt-1 text-xs text-plum-faint">
                          {b.orders} {tr("common.orders")}
                          {b.settled_not_withdrawn > 0 ? ` · ${statusName(tr, "settled_not_withdrawn")} ${thb(b.settled_not_withdrawn)}` : ""}
                        </p>
                      </div>
                      <span className="font-medium text-xl tabular text-plum">{thb(b.total)}</span>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between pt-3 text-sm">
                  <span className="text-plum-soft">{tr("common.total")}</span>
                  <span className="font-medium tabular">{thb(balance.pendingTotal)}</span>
                </li>
              </ul>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title={tr("dashboard.recentTitle")}
            subtitle={tr("dashboard.recentSubtitle")}
            action={
              <Link href="/transactions" className="min-h-11 inline-flex items-center text-sm text-berry hover:underline whitespace-nowrap">
                {tr("common.viewAll")} →
              </Link>
            }
          />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-lavender bg-lavender-tint/60 px-4 py-6 text-center">
                <p className="text-sm text-plum-soft">{tr("dashboard.recentNone")}</p>
                <div className="mt-3 flex justify-center">
                  <AddButton label={tr("dashboard.addFirst")} />
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((row) => (
                  <li key={row.id}>
                    <Link href={`/transactions/${row.id}/edit`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-lavender-tint">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-plum">
                          {row.type === "income" ? row.customer_name || platformName(tr, row.platform) : row.note || (row.category ? tr(`category.${row.category}`) : tr("common.expense"))}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-plum-faint">
                          <span>{formatDate(row.date, locale)}</span>
                          <span>· {row.type === "income" ? tr(`common.${row.received_by ?? "mike"}`) : tr(`common.${row.payer ?? "mike"}`)}</span>
                          {row.type === "income" && row.settlement ? (
                            <Pill tone={statusTone(row.settlement.status)} className="px-2 py-0 text-[10px]">
                              {statusName(tr, row.settlement.status)}
                            </Pill>
                          ) : null}
                        </p>
                      </div>
                      <span className={`shrink-0 tabular font-medium ${row.type === "expense" ? "text-plum-soft" : "text-berry"}`}>
                        {row.type === "expense" ? "-" : "+"}
                        {thb(row.net_amount)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={tr("dashboard.transfersTitle")} subtitle={tr("dashboard.transfersSubtitle")} action={<InfoTip text={tr("dashboard.transferHint")} />} />
        <div className="grid gap-5 px-5 pb-5 sm:px-6 sm:pb-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {transfers.length === 0 ? (
              <p className="text-sm text-plum-soft">{tr("dashboard.transfersNone")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {transfers.map((tf) => {
                  return (
                    <li key={tf.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link href={`/transfers/${tf.id}/edit`} className="min-w-0 flex-1 rounded-lg transition-colors hover:bg-lavender-tint">
                        <p className="text-sm text-plum">
                          {tr(`common.${tf.from_person}`)} → {tr(`common.${tf.to_person}`)}
                          <span className="ml-2 font-medium tabular">{thb(tf.amount)}</span>
                          <Pill tone={tf.kind === "capital" ? "lavender" : "neutral"} className="ml-2">
                            {tf.kind === "capital" ? tr("transfer.kindCapital") : tr("transfer.kindSettlement")}
                          </Pill>
                        </p>
                        <p className="truncate text-xs text-plum-faint">
                          {formatDate(tf.date, locale)}
                          {tf.note ? ` · ${tf.note}` : ""} · {tr("common.edit")} →
                        </p>
                      </Link>
                      {admin ? <SoftDeleteButton entity="internal_transfer" id={tf.id} variant="ghost" className="px-3 text-xs" /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <details className="group rounded-xl bg-ivory-deep/70 lg:col-span-2 lg:open" open={false}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-plum lg:cursor-default">
              {tr("transfer.title")}
              <span className="text-plum-faint transition-transform group-open:rotate-90 lg:hidden">→</span>
            </summary>
            <TransferForm tr={tr} action={createTransfer} error={transferError} submitLabel={tr("dashboard.addTransfer")} compact />
          </details>
        </div>
      </Card>

      {empty ? null : (
        <div className="mt-6 flex flex-wrap gap-2">
          <AddButton label={tr("transactions.addIncome")} type="income" />
          <AddButton label={tr("transactions.addExpense")} type="expense" variant="secondary" />
          <ButtonLink href="/payouts/new" variant="secondary">
            {tr("payouts.new")}
          </ButtonLink>
          <ButtonLink href="/import" variant="ghost">
            {tr("import.title")} ↗
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
