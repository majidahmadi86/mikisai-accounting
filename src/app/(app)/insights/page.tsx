import { InfoTip } from "@/components/ui/InfoTip";
import Link from "next/link";
import { RefreshButton } from "@/components/insights/RefreshButton";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { buildInsights, STALE_ORDER_DAYS, type ProductInsight } from "@/lib/insights/compute";
import { getWeeklyNarrative } from "@/lib/insights/narrative";
import { valueStock } from "@/lib/inventory/valuation";
import { buildInventoryReports, productLabel } from "@/lib/inventory/reports";
import { thisMonth } from "@/lib/reports/period";
import { platformName, platformTone, productName } from "@/lib/labels";
import { formatDate, thb, todayIso } from "@/lib/money";

const trendTone: Record<ProductInsight["trend"], PillTone> = { rising: "success", falling: "berry-soft", steady: "neutral", none: "neutral" };

function InsightCard({ eyebrow, headline, tone = "card", children }: { eyebrow: React.ReactNode; headline: React.ReactNode; tone?: "card" | "berry" | "lavender" | "success" | "warning"; children: React.ReactNode }) {
  return (
    <Card tone={tone} className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">{eyebrow}</div>
      <p className="mt-2 font-medium text-2xl tabular text-plum">{headline}</p>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-plum-soft">{children}</div>
    </Card>
  );
}

function Action({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 text-sm text-plum">
      <span className="text-berry">→</span>
      <span>{children}</span>
    </p>
  );
}

export default async function InsightsPage() {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);
  const today = todayIso();
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const insights = buildInsights(snapshot, today, valueStock(snapshot.products, snapshot.movements).cogsByTransaction);
  const plan = buildInventoryReports({ products: snapshot.products, movements: snapshot.movements, items: snapshot.items, sales: snapshot.transactions.filter((x) => x.type === "income").map((x) => ({ id: x.id, date: x.date, net_amount: x.net_amount })) }, thisMonth(today)).marginPlan;
  const narrative = insights.products.length ? await getWeeklyNarrative(session.profile.business_id, insights, locale) : null;

  return (
    <div>
      <PageHeader title={tr("insights.title")} subtitle={tr("insights.subtitle")} action={<RefreshButton />} />
      <p className="mb-5 text-xs text-plum-faint">{tr("insights.asOf", { date: formatDate(today, locale) })}</p>

      {insights.products.length === 0 && insights.cash.length === 0 && insights.exceptions.length === 0 ? (
        <EmptyState title={tr("insights.empty")} body={tr("insights.emptyBody")} />
      ) : (
        <div className="space-y-6">
          {narrative ? (
            <Card tone="lavender">
              <CardHeader title={tr("insights.narrative")} subtitle={tr("insights.narrativeDesc")} />
              <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                <p className="text-base leading-relaxed text-plum">{narrative}</p>
                <p className="mt-3 text-xs text-plum-faint">{tr("insights.narrativeBy")}</p>
              </div>
            </Card>
          ) : null}

          <section>
            <h2 className="text-2xl text-plum">{tr("insights.products")}</h2>
            <div className="mb-2">
              <InfoTip text={tr("insights.productsDesc")} align="left" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {insights.products.map((p) => (
                <InsightCard
                  key={p.product}
                  tone={p.tag === "push" ? "success" : p.tag === "review_pricing" ? "warning" : "card"}
                  eyebrow={
                    <>
                      <span className="eyebrow">{productName(tr, p.product)}</span>
                      <span className="flex gap-1.5">
                        {p.tag === "push" ? <Pill tone="success">{tr("insights.tagPush")}</Pill> : null}
                        {p.tag === "review_pricing" ? <Pill tone="warning">{tr("insights.tagReview")}</Pill> : null}
                        {p.trend !== "none" ? <Pill tone={trendTone[p.trend]}>{tr(`insights.${p.trend}`)}</Pill> : null}
                      </span>
                    </>
                  }
                  headline={thb(p.profit30)}
                >
                  <p className="text-xs text-plum-faint">{tr("insights.profit30")}</p>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="eyebrow text-[0.6rem]">{tr("insights.marginPerUnit")}</dt>
                      <dd className="tabular text-plum">{thb(p.marginPerUnit30)}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow text-[0.6rem]">{tr("insights.netPerUnit")}</dt>
                      <dd className="tabular text-plum">{thb(p.netPerUnit30)}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow text-[0.6rem]">{tr("insights.velocity")}</dt>
                      <dd className="tabular text-plum">
                        {p.unitsPerDay7} <span className="text-plum-faint">/ {p.unitsPerDay30}</span>
                      </dd>
                      <dd className="text-[0.6rem] text-plum-faint">{tr("insights.trend7v30")}</dd>
                    </div>
                  </dl>
                  <p>{tr("insights.productMeans", { units: p.units30, expenses: thb(p.expenses30), margin: thb(p.marginPerUnit30) })}</p>
                  {p.bestPlatform ? (
                    <p className="flex items-center gap-2">
                      <Pill tone={platformTone(p.bestPlatform.platform)}>{platformName(tr, p.bestPlatform.platform)}</Pill>
                      <span>{tr("insights.bestPlatformMeans", { platform: platformName(tr, p.bestPlatform.platform), amount: thb(p.bestPlatform.netPerOrder) })}</span>
                    </p>
                  ) : null}
                  <Action>{p.tag === "push" ? tr("insights.productActionPush") : p.tag === "review_pricing" ? tr("insights.productActionReview") : tr("insights.productActionSteady")}</Action>
                </InsightCard>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl text-plum">{tr("reports.marginPlan")}</h2>
            <div className="mb-2">
              <InfoTip text={tr("insights.marginPlanDesc")} align="left" />
            </div>
            {plan.length === 0 ? (
              <Card className="px-5 py-4 text-sm text-plum-soft">{tr("reports.marginPlanNone")}</Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {plan.map((r) => (
                  <InsightCard
                    key={r.product.id}
                    tone={r.worse ? "warning" : "card"}
                    eyebrow={
                      <>
                        <span className="eyebrow">{productLabel(r.product, locale)}</span>
                        {r.worse ? <Pill tone="warning">{tr("reports.worse")}</Pill> : <Pill tone="success">{tr("insights.onPlan")}</Pill>}
                      </>
                    }
                    headline={thb(r.actualMargin)}
                  >
                    <p>{tr("insights.marginPlanMeans", { expected: thb(r.expectedMargin), actual: thb(r.actualMargin), pct: r.variancePct === null ? "·" : `${r.variancePct}%` })}</p>
                    <Action>{r.worse ? tr("insights.marginPlanActionWorse") : tr("insights.marginPlanActionOk")}</Action>
                  </InsightCard>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-2xl text-plum">{tr("insights.drift")}</h2>
            <div className="mb-2">
              <InfoTip text={tr("insights.driftDesc")} align="left" />
            </div>
            {insights.drifting.length === 0 ? (
              <Card tone="success" className="px-5 py-4 text-sm text-success">
                {tr("insights.noDrift")}
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {insights.drifting.map((p) => (
                  <InsightCard key={p.product} tone="warning" eyebrow={<span className="eyebrow">{productName(tr, p.product)}</span>} headline={tr("insights.driftHeadline", { product: productName(tr, p.product), drop: p.drift!.dropPct })}>
                    <p>{tr("insights.driftMeans", { current: thb(p.drift!.current), baseline: thb(p.drift!.baseline) })}</p>
                    <Action>
                      <Link href={`/transactions?product=${p.product}&type=income`} className="text-berry hover:underline">
                        {tr("insights.driftAction")}
                      </Link>
                    </Action>
                  </InsightCard>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-2xl text-plum">{tr("insights.cash")}</h2>
            <div className="mb-2">
              <InfoTip text={tr("insights.cashDesc")} align="left" />
            </div>
            {insights.cash.length === 0 ? (
              <Card tone="success" className="px-5 py-4 text-sm text-success">
                {tr("insights.cashNone")}
              </Card>
            ) : (
              <Card tone="lavender" className="px-5 py-4">
                <p className="eyebrow">{tr("dashboard.pendingTitle")}</p>
                <p className="mt-1 font-medium text-2xl tabular text-plum">{tr("insights.cashHeadline", { amount: thb(insights.cashTotal) })}</p>
                <ul className="mt-3 divide-y divide-line">
                  {insights.cash.map((c) => (
                    <li key={c.platform} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Pill tone={platformTone(c.platform)}>{platformName(tr, c.platform)}</Pill>
                          <span className="text-xs text-plum-faint">
                            {c.orders} {tr("common.orders")}
                          </span>
                        </span>
                        <span className="font-medium tabular text-plum">{thb(c.pending)}</span>
                      </div>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <dt className="eyebrow text-[0.6rem]">{tr("insights.cashNext7")}</dt>
                          <dd className="tabular text-plum">{thb(c.next7)}</dd>
                        </div>
                        <div>
                          <dt className="eyebrow text-[0.6rem]">{tr("insights.cashLater")}</dt>
                          <dd className="tabular text-plum">{thb(c.later)}</dd>
                        </div>
                        <div>
                          <dt className="eyebrow text-[0.6rem]">{tr("insights.cashOverdue")}</dt>
                          <dd className={`tabular ${c.overdue > 0 ? "font-medium text-berry" : "text-plum"}`}>{thb(c.overdue)}</dd>
                        </div>
                      </dl>
                      <p className="mt-1.5 text-xs text-plum-soft">
                        {c.observedLag ? tr("insights.lagObserved", { days: c.lagDays }) : tr("insights.lagDefault", { days: c.lagDays })}
                        {c.nextArrival ? ` · ${tr("insights.nextArrival", { date: formatDate(c.nextArrival, locale) })}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Action>{tr("insights.cashAction")}</Action>
                </div>
              </Card>
            )}
          </section>

          <section>
            <h2 className="text-2xl text-plum">{tr("insights.exceptions")}</h2>
            <p className="mb-3 text-sm text-plum-soft">{tr("insights.exceptionsDesc", { days: STALE_ORDER_DAYS })}</p>
            {insights.exceptions.length === 0 ? (
              <Card tone="success" className="px-5 py-4 text-sm text-success">
                {tr("insights.noExceptions")}
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {insights.exceptions.map((e) => (
                  <InsightCard
                    key={`${e.kind}-${e.id}`}
                    tone="warning"
                    eyebrow={
                      <>
                        <span className="eyebrow">{e.kind === "unmatched_payout" ? tr("insights.unmatchedPayout") : tr("insights.staleOrder", { days: e.days })}</span>
                        <Pill tone={platformTone(e.platform)}>{platformName(tr, e.platform)}</Pill>
                      </>
                    }
                    headline={thb(e.amount)}
                  >
                    <p>
                      {e.kind === "unmatched_payout"
                        ? tr("insights.unmatchedMeans", { amount: thb(e.amount), platform: platformName(tr, e.platform), date: formatDate(e.date, locale) })
                        : tr("insights.staleMeans", { amount: thb(e.amount), platform: platformName(tr, e.platform), date: formatDate(e.date, locale) })}
                    </p>
                    <Action>
                      {e.kind === "unmatched_payout" ? (
                        <Link href={`/payouts/${e.id}/reconcile`} className="text-berry hover:underline">
                          {tr("insights.unmatchedAction")} →
                        </Link>
                      ) : (
                        <Link href={`/transactions/${e.id}/edit`} className="text-berry hover:underline">
                          {tr("insights.staleAction")} →
                        </Link>
                      )}
                    </Action>
                  </InsightCard>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
