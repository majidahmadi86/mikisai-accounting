import { ExposureChart } from "@/components/balance/ExposureChart";
import { MarkAsSent } from "@/components/balance/MarkAsSent";
import { Card, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ExpandableNote } from "@/components/ui/ExpandableNote";
import { partnerOf, personOf, requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone } from "@/lib/labels";
import { formatDate, thb, todayIso } from "@/lib/money";
import { buildMyBalance } from "@/lib/my-balance";
import { valueStock } from "@/lib/inventory/valuation";
import { cn } from "@/lib/cn";

const levelStyles = {
  ok: { card: "success" as const, text: "text-success", bar: "bg-success" },
  amber: { card: "warning" as const, text: "text-warning-ink", bar: "bg-warning" },
  red: { card: "berry" as const, text: "text-berry", bar: "bg-berry" },
};

export default async function MyBalancePage({ searchParams }: PageProps<"/balance">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const me = personOf(session);
  const partner = partnerOf(session);
  const today = todayIso();
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const b = buildMyBalance(
    {
      transactions: snapshot.transactions,
      transfers: snapshot.transfers,
      settings: snapshot.settings.map((s) => ({ platform: s.platform, settlement_lag_days: s.settlement_lag_days, daily_payout_pct: s.daily_payout_pct })),
      exposureLimit: snapshot.business.exposure_limit,
      stockValue: valueStock(snapshot.products, snapshot.movements).totalValue,
    },
    me,
    today,
  );
  const meName = tr(`common.${me}`);
  const partnerName = tr(`common.${partner}`);
  const level = levelStyles[b.level];

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow={meName} title={tr("balance.title")} subtitle={tr("balance.subtitle", { partner: partnerName })} />
      {sp.transfer === "saved" ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("common.saved")}</p> : null}

      {b.level === "red" ? (
        <div role="alert" className="mb-4 rounded-card border border-berry/30 bg-berry px-5 py-4 text-ivory">
          <p className="eyebrow text-ivory/80">{tr("balance.exposureTitle", { partner: partnerName })}</p>
          <p className="mt-1 text-lg font-medium">{tr("balance.exposureBanner")}</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* a) Owed to me now */}
        <Card tone={b.owedToMe > 0 ? "success" : b.iOwe > 0 ? "berry" : "card"} className="px-5 py-5">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">{tr("balance.owedTitle")}</p>
            <InfoTip text={tr("balance.owedHint", { partner: partnerName })} />
          </div>
          <p className={cn("mt-2 text-3xl font-medium tabular", b.owedToMe > 0 ? "text-success" : b.iOwe > 0 ? "text-berry" : "text-plum")}>
            {b.owedToMe > 0 ? thb(b.owedToMe) : b.iOwe > 0 ? `-${thb(b.iOwe)}` : thb(0)}
          </p>
          <p className="mt-1 text-sm text-plum-soft">
            {b.owedToMe > 0 ? tr("balance.owedToMe", { name: partnerName, amount: thb(b.owedToMe) }) : b.iOwe > 0 ? tr("balance.iOwe", { name: partnerName, amount: thb(b.iOwe) }) : tr("balance.even")}
          </p>
        </Card>

        {/* b) Still coming */}
        <Card>
          <CardHeader title={tr("balance.incomingTitle")} subtitle={tr("balance.incomingHint")} action={<span className="font-medium tabular text-plum">{thb(b.incomingTotal)}</span>} />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {b.incoming.length === 0 ? (
              <p className="text-sm text-plum-soft">{tr("balance.incomingNone")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {b.incoming.map((row) => (
                  <li key={row.platform} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Pill tone={platformTone(row.platform)}>{platformName(tr, row.platform)}</Pill>
                        <p className="mt-1 text-xs text-plum-faint">{tr("balance.incomingOf", { total: thb(row.total), n: row.orders })}</p>
                        <p className="mt-1 text-xs text-plum-soft">
                          {row.lastArrival ? tr("balance.arrivesBy", { date: formatDate(row.lastArrival, locale) }) : ""}
                          {row.nextArrival && row.nextArrival !== row.lastArrival ? ` · ${tr("balance.arrivesNext", { date: formatDate(row.nextArrival, locale) })}` : ""}
                        </p>
                        <p className="text-xs text-plum-faint">{row.earlyPct < 100 ? tr("balance.arrivesEarly", { pct: row.earlyPct, days: row.lagDays }) : tr("balance.arrivesLag", { days: row.lagDays })}</p>
                        {row.overdue > 0 ? <p className="mt-1 text-xs font-medium text-warning-ink">{tr("balance.overdueAmount", { amount: thb(row.overdue / 2) })}</p> : null}
                      </div>
                      <span className="shrink-0 font-medium tabular text-plum">{thb(row.myShare)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* c) Exposure */}
        <Card tone={level.card} className="px-5 py-5">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">{tr("balance.exposureTitle", { partner: partnerName })}</p>
            <InfoTip text={tr("balance.exposureHint")} />
          </div>
          <p className={cn("mt-2 text-3xl font-medium tabular", level.text)}>{thb(b.exposure)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-card/80">
            <div className={cn("h-full rounded-full", level.bar)} style={{ width: `${Math.min(100, b.exposureLimit > 0 ? (b.exposure / b.exposureLimit) * 100 : 100)}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-plum-soft">
            <span>{tr("balance.ofLimit", { pct: Math.round(b.exposurePct) })}</span>
            <span>{tr("balance.limit", { amount: thb(b.exposureLimit) })}</span>
          </p>
        </Card>

        {/* stock share, kept apart from cash */}
        <Card tone="ivory" className="px-5 py-5">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">{tr("balance.stockTitle")}</p>
            <InfoTip text={tr("balance.stockHint")} />
          </div>
          <p className="mt-2 text-3xl font-medium tabular text-plum">{thb(b.stockShare)}</p>
          <p className="mt-1 text-sm text-plum-soft">{tr("balance.stockOf", { total: thb(b.stockValue) })}</p>
        </Card>

        {/* d) Today's action */}
        <Card tone="lavender">
          <CardHeader title={tr("balance.actionTitle")} subtitle={tr("balance.actionHint")} />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <p className="text-lg font-medium text-plum">
              {b.action ? tr("balance.actionSend", { from: tr(`common.${b.action.from}`), to: tr(`common.${b.action.to}`), amount: thb(b.action.amount) }) : tr("balance.actionNone")}
            </p>
            {b.action ? (
              <div className="mt-3">
                <MarkAsSent from={b.action.from} to={b.action.to} amount={b.action.amount} today={today} />
              </div>
            ) : null}
          </div>
        </Card>

        {/* e) Capital */}
        <Card>
          <CardHeader title={tr("balance.capitalTitle")} subtitle={tr("balance.capitalHint")} action={<span className="font-medium tabular text-plum">{thb(b.capitalTotal)}</span>} />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {b.capital.length === 0 ? (
              <p className="text-sm text-plum-soft">{tr("balance.capitalNone")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {b.capital.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-plum">
                        {formatDate(c.date, locale)} <span className="text-plum-faint">· {tr(`transfer.reason.${c.reason}`)}</span>
                      </p>
                      {c.note ? <ExpandableNote text={c.note} className="text-xs text-plum-faint" /> : null}
                    </div>
                    <span className="tabular font-medium text-plum">{thb(c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* f) 30-day chart */}
        <Card>
          <CardHeader title={tr("balance.chartTitle")} subtitle={tr("balance.chartHint", { partner: partnerName })} />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <ExposureChart series={b.series} limit={b.exposureLimit} locale={locale} />
          </div>
        </Card>
      </div>
    </div>
  );
}
