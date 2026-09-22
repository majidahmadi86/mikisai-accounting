import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DownloadIcon } from "@/components/ui/Icons";
import { InfoTip } from "@/components/ui/InfoTip";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDate, thb, todayIso } from "@/lib/money";
import { addDays } from "@/lib/reports/period";
import { weekOf } from "@/lib/week";
import { markWeekSent } from "./actions";
import { unitsText, weekFromSnapshot } from "@/lib/week-view";
import { cn } from "@/lib/cn";


function Row({ label, value, strong = false, tone }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: "berry" | "success" | "faint" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line/70 py-2 first:border-t-0">
      <span className={cn("min-w-0 text-sm", tone === "faint" ? "text-plum-faint" : "text-plum-soft")}>{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap tabular", strong ? "text-lg font-medium" : "text-sm", tone === "berry" ? "text-berry" : tone === "success" ? "text-success" : tone === "faint" ? "text-plum-faint" : "text-plum")}>{value}</span>
    </div>
  );
}

function Section({ title, tip, children }: { title: string; tip?: string; children: React.ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <h2 className="mb-1 flex items-center gap-2 text-lg text-plum">
        {title}
        {tip ? <InfoTip text={tip} align="left" /> : null}
      </h2>
      {children}
    </Card>
  );
}

/** This week, Monday to Sunday unless another first day is picked: one line per fact, each with its number. */
export default async function WeekPage({ searchParams }: PageProps<"/week">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const today = todayIso();
  const period = weekOf(typeof sp.from === "string" ? sp.from : null, today);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const w = weekFromSnapshot(snapshot, period, today);
  const prev = addDays(period.from, -7);
  const next = addDays(period.from, 7);
  const isCurrent = period.to >= today;
  const pill = "inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-card px-4 text-sm font-medium text-plum-soft hover:border-berry hover:text-berry";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={tr("week.title")}
        subtitle={tr("week.subtitle")}
        action={
          <>
            <a href={`/week/export?format=xlsx&from=${period.from}`} className={pill}>
              <DownloadIcon className="h-4 w-4" /> {tr("reports.xlsx")}
            </a>
            <a href={`/week/export?format=pdf&from=${period.from}`} className={pill}>
              <DownloadIcon className="h-4 w-4" /> {tr("reports.pdf")}
            </a>
          </>
        }
      />

      {sp.sent === "1" ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("week.sentDone")}</p> : null}
      {sp.sent === "error" ? <p className="mb-4 rounded-xl bg-berry-tint px-4 py-3 text-sm text-berry">{tr("common.error")}</p> : null}
      <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/week?from=${prev}`} className={pill} aria-label={tr("week.previous")}>
          ← {tr("week.previous")}
        </Link>
        <p className="min-w-0 px-2 text-sm font-medium text-plum tabular">{tr("week.range", { from: formatDate(period.from, locale), to: formatDate(period.to, locale) })}</p>
        {isCurrent ? null : (
          <Link href={`/week?from=${next}`} className={pill} aria-label={tr("week.next")}>
            {tr("week.next")} →
          </Link>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-plum-faint">
          <span className="sr-only">{tr("week.pick")}</span>
          <input type="date" name="from" defaultValue={period.from} className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm text-plum" aria-label={tr("week.pick")} />
          <button type="submit" className={pill}>
            {tr("reports.apply")}
          </button>
        </label>
      </form>

      <div className="space-y-3">
        <Section title={tr("week.sold")}>
          <Row label={tr("week.orders")} value={w.sold.orders} strong />
          {w.sold.variants.map((v) => (
            <Row key={v.product_id} label={v.name} value={unitsText(tr, v.qty, "", v.unit).trim()} />
          ))}
          <Row label={tr("week.cancelledBeforeShipping")} value={w.sold.cancelledBeforeShipping} tone="faint" />
        </Section>

        <Section title={tr("week.tiktok")} tip={tr("week.tiktokTip")}>
          <Row label={tr("week.expected")} value={thb(w.tiktok.expected)} strong />
          <Row label={tr("week.settled")} value={thb(w.tiktok.settled)} tone="success" />
          <Row label={tr("week.advanced")} value={thb(w.tiktok.advanced)} />
          <Row label={tr("week.stillToCome")} value={thb(w.tiktok.stillToCome)} />
        </Section>

        <Section title={tr("week.bought")}>
          {w.bought.variants.length ? w.bought.variants.map((v) => <Row key={v.product_id} label={v.name} value={unitsText(tr, v.qty, "", v.unit).trim()} />) : <Row label={tr("week.nothingBought")} value="0" tone="faint" />}
          <Row label={tr("week.boughtAmount")} value={thb(w.bought.amount)} strong />
          {(["sai", "mike"] as const)
            .filter((p) => w.bought.byPerson[p] > 0)
            .map((p) => (
              <Row key={p} label={tr("week.paidBy", { name: tr(`common.${p}`) })} value={thb(w.bought.byPerson[p])} />
            ))}
          {w.bought.other.map((o) => (
            <Row key={o.label} label={o.label} value={thb(o.amount)} />
          ))}
        </Section>

        <Section title={tr("week.profit")} tip={tr("week.profitTip")}>
          <Row label={tr("week.profitExpected")} value={thb(w.profit.expected)} strong tone={w.profit.expected >= 0 ? "success" : "berry"} />
          <Row label={tr("week.expected")} value={thb(w.profit.expectedIncome)} tone="faint" />
          <Row label={tr("week.costOfUnits")} value={`-${thb(w.profit.costOfUnits)}`} tone="faint" />
          <Row label={tr("week.otherCosts")} value={`-${thb(w.profit.otherCosts)}`} tone="faint" />
        </Section>

        <Section title={tr("week.cash")} tip={tr("week.cashTip")}>
          <div className="mt-1 rounded-xl bg-lavender-tint px-4 py-3">
            <p className="text-lg font-medium text-plum" data-testid="week-owes">
              {w.cash.owes ? tr("week.sends", { from: tr(`common.${w.cash.owes.from}`), to: tr(`common.${w.cash.owes.to}`), amount: thb(w.cash.owes.amount) }) : tr("week.even")}
            </p>
            <p className="mt-1 text-xs text-plum-soft">{tr("week.oneTransfer")}</p>
            {w.cash.owes ? (
              <form action={markWeekSent} className="mt-3">
                <input type="hidden" name="from" value={period.from} />
                <Button type="submit" className="min-h-11">{tr("balance.markSent")}</Button>
              </form>
            ) : null}
          </div>
          {(["sai", "mike"] as const).map((p) => (
            <p key={p} className="mt-2 text-sm text-plum-soft" data-testid={`week-side-${p}`}>
              {tr("week.side", { name: tr(`common.${p}`), paid: thb(w.cash.paid[p]), received: thb(w.cash.received[p]) })}
              {w.cash.advanced[p] > 0 ? ` ${tr("week.sideAdvanced", { amount: thb(w.cash.advanced[p]) })}` : ""}
            </p>
          ))}
        </Section>

        <Section title={tr("week.buy")} tip={tr("week.buyTip")}>
          {w.buy.length ? (
            w.buy.map((b) => <Row key={b.product_id} label={tr("week.buyLine", { name: b.name, backlog: b.backlog, buffer: b.buffer })} value={unitsText(tr, b.toBuy, "", b.unit).trim()} strong />)
          ) : (
            <Row label={tr("week.nothingToBuy")} value="0" tone="faint" />
          )}
        </Section>
      </div>
    </div>
  );
}
