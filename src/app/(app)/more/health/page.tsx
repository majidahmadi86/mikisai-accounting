import { InfoTip } from "@/components/ui/InfoTip";
import { ConfirmTagButton } from "@/components/health/ConfirmTagButton";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import type { HealthKey } from "@/lib/health/checks";
import { loadAuditForHealth, recordHealthRun, runHealth } from "@/lib/health/run";
import { formatDateTime, thb, todayIso } from "@/lib/money";
import { lostTotal } from "@/lib/health/tiktok-money";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/** Runs every check on load and records the run. Admin sees every row; a contributor sees the same counts and rows except the audit-based check. */
export default async function DataHealthPage() {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);
  const admin = session.profile.role === "admin";
  const today = todayIso();
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const audit = admin ? await loadAuditForHealth(session.supabase, session.profile.business_id) : null;
  const result = await runHealth(snapshot, audit, today, locale);
  await recordHealthRun(session.supabase, session.profile.business_id, result, "page", session.userId);

  return (
    <div className="max-w-3xl">
      <PageHeader title={tr("health.title")} subtitle={tr("health.subtitle")} action={<ButtonLink href={`/more/health?ran=${encodeURIComponent(result.ranAt)}`} variant="secondary">{tr("health.run")}</ButtonLink>} />
      <Card tone={result.ok ? "success" : "berry"} className="mb-4 px-5 py-5">
        <p className={cn("text-2xl font-medium", result.ok ? "text-success" : "text-berry")}>{result.ok ? tr("health.allClear") : tr("health.issues", { n: result.issues })}</p>
        <p className="mt-1 text-xs text-plum-soft">
          {tr("health.ranAt", { time: formatDateTime(result.ranAt, locale) })} · {tr("health.daily")}
          {!admin ? ` · ${tr("health.readOnly")}` : ""}
        </p>
      </Card>

      <Card className="mb-4 px-5 py-4">
        <p className="flex items-center gap-2 text-base font-medium text-plum">
          {tr("health.cancellations")}
          <InfoTip text={tr("health.cancellations.desc")} align="left" />
        </p>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-plum-soft">{tr("health.cancelledBefore")}</dt>
            <dd className="font-medium text-plum tabular" data-testid="health-cancelled-before">{result.cancellations.beforeShipping}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-plum-soft">{tr("health.cancelledAfter")}</dt>
            <dd className="font-medium text-plum tabular" data-testid="health-cancelled-after">{result.cancellations.afterShipping}</dd>
          </div>
        </dl>
      </Card>

      <div className="space-y-3">
        {result.checks.map((c) => (
          <Card key={c.key} tone={c.skipped ? "ivory" : c.count ? (c.key === "consistency" ? "berry" : "warning") : "card"} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-base font-medium text-plum">
                  {tr(`health.${c.key}` as `health.${HealthKey}`)}
                  <InfoTip text={tr(`health.${c.key}.desc` as `health.${HealthKey}.desc`)} align="left" />
                </p>
              </div>
              {c.skipped ? (
                <Pill tone="neutral">{tr("health.adminOnly")}</Pill>
              ) : (
                <Pill tone={c.count ? (c.key === "consistency" ? "berry" : "warning") : "success"}>
                  {c.count}
                  {c.count && (c.key === "overweight_week" || c.key === "returns_week") ? ` · ${thb(lostTotal(c.issues))}` : ""}
                </Pill>
              )}
            </div>
            {c.count ? (
              <ul className="mt-3 divide-y divide-line/60">
                {c.issues.slice(0, 50).map((i, idx) => (
                  <li key={`${i.id}-${idx}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 text-plum">
                      <span className="block truncate">
                        {i.label}
                        {i.detail ? <span className="ml-2 text-xs text-plum-faint">{i.detail}</span> : null}
                      </span>
                      {c.key === "no_order_ref" ? <span className="block text-xs text-plum-soft">{i.meta?.reason ? tr("health.noDedupeReason", { reason: i.meta.reason }) : tr("health.noDedupe")}</span> : null}
                      {c.key === "backlog_no_purchase" && i.meta ? <span className="block text-xs text-plum-soft">{tr("health.backlogExplain", { sold: i.meta.sold, bought: i.meta.bought, n: i.meta.n })}</span> : null}
                      {i.links?.length ? (
                        <span className="mt-0.5 flex flex-wrap gap-x-4 text-xs">
                          {i.links.map((l) => (
                            <Link key={l.href} href={l.href} className="inline-flex min-h-8 items-center font-medium text-berry hover:underline">
                              {tr(l.kind === "deleted" ? "health.backlogDeleted" : l.kind === "cleanup" ? "health.openCleanup" : "health.backlogOrders")} →
                            </Link>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    {c.key === "date_assumed" ? <ConfirmTagButton id={i.id.replace(/:qty$/, "")} tag={i.id.endsWith(":qty") ? "qty_inferred" : "date_assumed"} /> : null}
                    {i.href ? (
                      <Link href={i.href} className="shrink-0 whitespace-nowrap text-xs font-medium text-berry hover:underline">
                        {tr("health.openRow")} →
                      </Link>
                    ) : null}
                  </li>
                ))}
                {c.issues.length > 50 ? <li className="py-2 text-xs text-plum-faint">{tr("health.more", { n: c.issues.length - 50 })}</li> : null}
              </ul>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
