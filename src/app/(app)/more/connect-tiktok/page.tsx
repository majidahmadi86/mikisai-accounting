import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTiktokStatus, recentSyncLog } from "@/lib/tiktok/load-status";
import { relativeTime } from "@/lib/tiktok/status";
import { disconnectTiktok, startTiktokAuth, syncTiktokNow } from "./actions";

const CALLBACK = "https://mikisai.mikaro.studio/api/tiktok/callback";
const WEBHOOK = "https://mikisai.mikaro.studio/api/tiktok/webhook";

/** Walks Mike and Sai through connecting the shop once, then shows the connection and every sync. */
export default async function ConnectTiktokPage({ searchParams }: PageProps<"/more/connect-tiktok">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const admin = session.profile.role === "admin";
  const db = createAdminClient();
  const [status, logs] = await Promise.all([loadTiktokStatus(db, session.profile.business_id), recentSyncLog(db, session.profile.business_id, 20)]);
  const error = typeof sp.error === "string" ? sp.error : null;
  const tone = status.state === "connected" ? "success" : status.state === "expired" || status.state === "error" ? "berry" : "lavender";

  return (
    <div className="max-w-3xl">
      <PageHeader title={tr("tiktok.title")} subtitle={tr("tiktok.subtitle")} />
      {sp.connected ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("tiktok.justConnected")}</p> : null}
      {sp.disconnected ? <p className="mb-4 rounded-xl bg-warning-tint px-4 py-3 text-sm text-warning-ink">{tr("tiktok.justDisconnected")}</p> : null}
      {sp.synced ? <p className="mb-4 rounded-xl bg-lavender-tint px-4 py-3 text-sm text-plum">{tr(sp.synced === "ok" ? "tiktok.syncedOk" : sp.synced === "skipped" ? "tiktok.syncedSkipped" : "tiktok.syncedError")}</p> : null}
      {error ? <p className="mb-4 rounded-xl bg-berry-tint px-4 py-3 text-sm text-berry">{tr(`tiktok.error.${error === "not_configured" || error === "bad_state" || error === "exchange_failed" || error === "admin_only" ? error : "other"}`)}</p> : null}

      <Card tone={tone} className="px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{tr("tiktok.statusTitle")}</p>
            <p className="mt-1 text-xl font-medium text-plum">{tr(`tiktok.state.${status.state}`)}</p>
            {status.connected ? (
              <p className="mt-1 text-sm text-plum-soft">
                {[status.shop_name || status.seller_name, status.connected_at ? tr("tiktok.since", { date: formatDateTime(status.connected_at, locale) }) : ""].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {status.last_sync_at ? (
              <p className="mt-1 text-sm text-plum-soft">
                {tr("tiktok.lastSync", { time: relativeTime(status.last_sync_at, locale) })}
                {status.last_log ? ` · ${tr("tiktok.newOrders", { n: status.last_log.orders_new })}` : ""}
                {status.queued ? ` · ${tr("tiktok.toReview", { n: status.queued })}` : ""}
              </p>
            ) : null}
            {status.last_error ? <p className="mt-2 text-xs text-berry [overflow-wrap:anywhere]">{status.last_error}</p> : null}
          </div>
          <Pill tone={status.state === "connected" ? "success" : status.state === "not_configured" ? "neutral" : "warning"}>{tr(`tiktok.pill.${status.state}`)}</Pill>
        </div>
        {admin ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={startTiktokAuth}>
              <Button type="submit" disabled={!status.configured}>
                {status.connected ? tr("tiktok.reauthorize") : tr("tiktok.authorize")}
              </Button>
            </form>
            {status.connected ? (
              <>
                <form action={syncTiktokNow}>
                  <Button type="submit" variant="secondary">
                    {tr("tiktok.syncNow")}
                  </Button>
                </form>
                <form action={disconnectTiktok}>
                  <Button type="submit" variant="ghost">
                    {tr("tiktok.disconnect")}
                  </Button>
                </form>
              </>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-plum-faint">{tr("tiktok.adminOnly")}</p>
        )}
        {status.queued ? (
          <Link href="/import" className="mt-3 inline-block text-sm font-medium text-berry hover:underline">
            {tr("tiktok.reviewLink", { n: status.queued })} →
          </Link>
        ) : null}
      </Card>

      <Card className="mt-4">
        <CardHeader title={tr("tiktok.stepsTitle")} subtitle={tr("tiktok.stepsSubtitle")} />
        <ol className="space-y-4 px-5 pb-5 text-sm text-plum sm:px-6 sm:pb-6">
          <li>
            <p className="font-medium">1. {tr("tiktok.step1Title")}</p>
            <p className="mt-1 text-plum-soft">{tr("tiktok.step1Body")}</p>
            <dl className="mt-2 space-y-1 rounded-xl bg-ivory-deep px-3 py-2 text-xs">
              <div>
                <dt className="eyebrow">{tr("tiktok.redirectUrl")}</dt>
                <dd className="font-mono [overflow-wrap:anywhere]">{CALLBACK}</dd>
              </div>
              <div>
                <dt className="eyebrow">{tr("tiktok.webhookUrl")}</dt>
                <dd className="font-mono [overflow-wrap:anywhere]">{WEBHOOK}</dd>
              </div>
            </dl>
          </li>
          <li>
            <p className="font-medium">2. {tr("tiktok.step2Title")}</p>
            <p className="mt-1 text-plum-soft">{tr("tiktok.step2Body")}</p>
            <p className="mt-1 text-xs">
              <Pill tone={status.configured ? "success" : "warning"}>{status.configured ? tr("tiktok.envReady") : tr("tiktok.envMissing")}</Pill>
            </p>
          </li>
          <li>
            <p className="font-medium">3. {tr("tiktok.step3Title")}</p>
            <p className="mt-1 text-plum-soft">{tr("tiktok.step3Body")}</p>
          </li>
          <li>
            <p className="font-medium">4. {tr("tiktok.step4Title")}</p>
            <p className="mt-1 text-plum-soft">{tr("tiktok.step4Body")}</p>
          </li>
        </ol>
      </Card>

      <Card className="mt-4">
        <CardHeader title={tr("tiktok.logTitle")} subtitle={tr("tiktok.logSubtitle")} />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {logs.length === 0 ? (
            <p className="text-sm text-plum-soft">{tr("tiktok.logEmpty")}</p>
          ) : (
            <>
              <ul className="divide-y divide-line md:hidden">
                {logs.map((l) => (
                  <li key={l.id} className="py-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <Pill tone={l.status === "ok" ? "success" : l.status === "error" ? "berry-soft" : "neutral"}>{tr(`tiktok.log.${l.status}`)}</Pill>
                      <span className="text-xs text-plum-faint">
                        {formatDateTime(l.started_at, locale)} · {tr(`tiktok.trigger.${l.trigger}`)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-plum-soft">{tr("tiktok.logCounts", { orders: l.orders_new, cancellations: l.cancellations, refunds: l.refunds, payouts: l.payouts, queued: l.queued })}</p>
                    {l.error ? <p className="mt-1 text-xs text-berry [overflow-wrap:anywhere]">{l.error}</p> : null}
                  </li>
                ))}
              </ul>
              <Table>
                <thead>
                  <tr>
                    <Th>{tr("tiktok.colWhen")}</Th>
                    <Th>{tr("tiktok.colTrigger")}</Th>
                    <Th>{tr("common.status")}</Th>
                    <Th align="right">{tr("tiktok.colOrders")}</Th>
                    <Th align="right">{tr("tiktok.colCancelled")}</Th>
                    <Th align="right">{tr("tiktok.colRefunds")}</Th>
                    <Th align="right">{tr("tiktok.colPayouts")}</Th>
                    <Th align="right">{tr("tiktok.colQueued")}</Th>
                    <Th>{tr("tiktok.colError")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(l.started_at, locale)}</Td>
                      <Td>{tr(`tiktok.trigger.${l.trigger}`)}</Td>
                      <Td>
                        <Pill tone={l.status === "ok" ? "success" : l.status === "error" ? "berry-soft" : "neutral"}>{tr(`tiktok.log.${l.status}`)}</Pill>
                      </Td>
                      <Td align="right">{l.orders_new}</Td>
                      <Td align="right">{l.cancellations}</Td>
                      <Td align="right">{l.refunds}</Td>
                      <Td align="right">{l.payouts}</Td>
                      <Td align="right">{l.queued}</Td>
                      <Td className="max-w-64 text-xs text-berry [overflow-wrap:anywhere]">{l.error}</Td>
                    </tr>
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
