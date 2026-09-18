import Link from "next/link";
import { BalanceBanner } from "@/components/dashboard/BalanceBanner";
import { AddButton } from "@/components/nav/AddButton";
import { Tour } from "@/components/tour/Tour";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SoftDeleteButton } from "@/components/ui/SoftDeleteButton";
import { RecordTransferButton } from "@/components/transfers/RecordTransferButton";
import { QuickOrderButton } from "@/components/quick-entry/QuickOrderButton";
import { InstallCard } from "@/components/pwa/InstallCard";
import { InfoTip } from "@/components/ui/InfoTip";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { ExpandableNote } from "@/components/ui/ExpandableNote";
import { requireSession } from "@/lib/auth";
import { whoOwesWhom, stockPositions } from "@/lib/truth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone, statusName, statusTone } from "@/lib/labels";
import { categoryById, categoryLabel } from "@/lib/categories";
import { formatDate, thb } from "@/lib/money";
import { PLATFORMS } from "@/lib/types";
import { ItemsSummary } from "@/components/transactions/ItemsSummary";
import { YesterdayCard } from "@/components/dashboard/YesterdayCard";
import { buildYesterday } from "@/lib/dashboard/yesterday";
import { summariseItems } from "@/lib/inventory/units";
import { todayIso } from "@/lib/money";
import { lastHealthRun } from "@/lib/health/run";
import { payoutReminderDue } from "@/lib/payouts/partial";
import { shortProductName } from "@/lib/inventory/units";
import { StockPill } from "@/components/products/StockPill";
import { formatDateTime } from "@/lib/money";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const admin = session.profile.role === "admin";
  const categories = categoryById(snapshot.categories);

  const balance = whoOwesWhom(snapshot, todayIso());
  const recent = snapshot.transactions.slice(0, 8);
  const productsById = new Map(snapshot.products.map((p) => [p.id, p]));
  const itemsOf = (id: string) => summariseItems(snapshot.items.filter((i) => i.transaction_id === id), productsById, locale, (n) => tr("transactions.items", { n }));
  const yesterday = buildYesterday(snapshot, todayIso());
  const health = await lastHealthRun(session.supabase, session.profile.business_id);
  const reminder = payoutReminderDue(new Date(), balance.pendingTotal, snapshot.payouts.map((p) => p.date));
  const stockRows = stockPositions(snapshot).filter((r) => r.product.active);
  const transfers = snapshot.transfers.slice(0, 20);
  const pendingPlatforms = PLATFORMS.filter((p) => balance.pendingByPlatform[p].orders > 0);
  const transferError = typeof sp.transfer === "string" ? sp.transfer : null;
  const empty = snapshot.transactions.length === 0;

  return (
    <div>
      <Tour autoOpen />
      {!admin ? <InstallCard /> : null}
      <BalanceBanner balance={balance} tr={tr} />
      <p className="-mt-3 mb-6 text-xs text-plum-faint">
        <Link href="/import" className="hover:underline">
          {snapshot.lastImport
            ? tr("dashboard.lastImport", { source: tr(`dashboard.source.${snapshot.lastImport.source}`), time: formatDateTime(snapshot.lastImport.ran_at, locale), orders: snapshot.lastImport.orders, cancellations: snapshot.lastImport.cancellations, payouts: snapshot.lastImport.payouts })
            : tr("dashboard.lastImportNone")}{" "}
          →
        </Link>
      </p>

      {reminder ? (
        <Link href="/payouts/new" className="mb-6 block rounded-card border border-lavender bg-lavender-tint px-5 py-4 transition-colors hover:bg-lavender-soft">
          <p className="eyebrow">{tr("dashboard.payoutReminderTitle")}</p>
          <p className="mt-1 text-sm text-plum">{tr("dashboard.payoutReminder")} →</p>
        </Link>
      ) : null}

      {stockRows.length ? (
        <Link href="/stock" className="mb-6 flex flex-wrap items-center gap-2 rounded-card border border-line bg-card px-4 py-3 transition-colors hover:bg-lavender-tint">
          <span className="eyebrow mr-1">{tr("stock.title")} →</span>
          {stockRows.map((r) => (
            <span key={r.product.id} className="inline-flex items-center gap-1.5 text-xs text-plum">
              <span className="max-w-32 truncate">{shortProductName(r.product, locale)}</span>
              <StockPill row={r} tr={tr} />
            </span>
          ))}
        </Link>
      ) : null}

      <YesterdayCard data={yesterday} tr={tr} locale={locale} />

      <p className="-mt-3 mb-6 text-xs text-plum-faint">
        <Link href="/more/health" className={health && health.issues > 0 ? "font-medium text-warning-ink hover:underline" : "hover:underline"}>
          {health ? (health.issues > 0 ? tr("health.homeIssues", { n: health.issues, time: formatDateTime(health.ran_at, locale) }) : tr("health.homeOk", { time: formatDateTime(health.ran_at, locale) })) : tr("health.homeNever")} →
        </Link>
      </p>

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
                        <p className="line-clamp-2 text-sm text-plum">
                          {row.type === "income" ? row.customer_name || platformName(tr, row.platform) : row.note || categoryLabel(categories.get(row.category_id ?? ""), locale) || tr("common.expense")}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-plum-faint">
                          <span>{formatDate(row.date, locale)}</span>
                          {(() => {
                            const s = itemsOf(row.id);
                            return s ? <span className="text-plum-soft">· <ItemsSummary label={s.label} lines={s.lines} /></span> : null;
                          })()}
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
                            {tr(`transfer.reason.${tf.reason}`)}
                          </Pill>
                        </p>
                        <p className="text-xs text-plum-faint">
                          {formatDate(tf.date, locale)} · {tr("common.edit")} →
                        </p>
                        {tf.note ? <ExpandableNote text={tf.note} className="text-xs text-plum-soft" /> : null}
                      </Link>
                      {admin ? <SoftDeleteButton entity="internal_transfer" id={tf.id} variant="ghost" className="px-3 text-xs" /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="rounded-xl bg-ivory-deep/70 p-4 lg:col-span-2">
            <p className="text-sm text-plum-soft">{tr("dashboard.transferHint")}</p>
            {transferError ? <p className="mt-2 rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{tr("common.error")}</p> : null}
            <RecordTransferButton className="mt-3 w-full sm:w-auto" />
          </div>
        </div>
      </Card>

      {empty ? null : (
        <div className="mt-6 flex flex-wrap gap-2">
          <QuickOrderButton variant="primary" />
          <AddButton label={tr("transactions.addIncome")} type="income" variant="secondary" />
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
