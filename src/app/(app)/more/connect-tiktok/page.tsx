import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { RowDetail, Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTiktokStatus, recentSyncLog } from "@/lib/tiktok/load-status";
import { relativeTime } from "@/lib/tiktok/status";
import { disconnectTiktok, saveAppStatus, startTiktokAuth, syncTiktokNow } from "./actions";
import { Field, Input, Select } from "@/components/ui/Field";
import { formatDate } from "@/lib/money";

const CALLBACK = "https://mikisai.mikaro.studio/api/tiktok/callback";
const WEBHOOK = "https://mikisai.mikaro.studio/api/tiktok/webhook";

/** Walks Mike and Sai through connecting the shop once, then shows the connection and every sync. */
export default async function ConnectTiktokPage({ searchParams }: PageProps<"/more/connect-tiktok">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const admin = session.profile.role === "admin";
  const db = createAdminClient();
  const [status, logs, { data: app }] = await Promise.all([loadTiktokStatus(db, session.profile.business_id), recentSyncLog(db, session.profile.business_id, 20), session.supabase.from("tiktok_app_status").select("approval, ticket_date, note").eq("business_id", session.profile.business_id).maybeSingle()]);
  const approved = app?.approval === "approved";
  const error = typeof sp.error === "string" ? sp.error : null;
  const tone = status.state === "connected" ? "success" : status.state === "expired" || status.state === "error" ? "berry" : "lavender";

  return (
    <div className="max-w-3xl">
      <PageHeader title={tr("tiktok.title")} subtitle={tr("tiktok.subtitle")} />
      {sp.connected ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("tiktok.justConnected")}</p> : null}
      {sp.disconnected ? <p className="mb-4 rounded-xl bg-warning-tint px-4 py-3 text-sm text-warning-ink">{tr("tiktok.justDisconnected")}</p> : null}
      {sp.synced ? <p className="mb-4 rounded-xl bg-lavender-tint px-4 py-3 text-sm text-plum">{tr(sp.synced === "ok" ? "tiktok.syncedOk" : sp.synced === "skipped" ? "tiktok.syncedSkipped" : "tiktok.syncedError")}</p> : null}
      {sp.status_saved ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("common.saved")}</p> : null}
      {error ? <p className="mb-4 rounded-xl bg-berry-tint px-4 py-3 text-sm text-berry">{tr(`tiktok.error.${error === "not_configured" || error === "bad_state" || error === "exchange_failed" || error === "admin_only" || error === "not_approved" ? error : "other"}`)}</p> : null}

      <Card tone={approved ? "success" : "warning"} className="mb-4 px-5 py-5">
        <p className="eyebrow">{tr("tiktok.approvalTitle")}</p>
        <p className="mt-1 text-lg font-medium text-plum">
          {approved ? tr("tiktok.approvalReceived") : [tr("tiktok.approvalPending"), tr("tiktok.approvalCaveat"), app?.ticket_date ? tr("tiktok.ticketSent", { date: formatDate(app.ticket_date as string, locale) }) : tr("tiktok.ticketNone")].join(" · ")}
        </p>
        {app?.note ? <p className="mt-1 text-sm text-plum-soft [overflow-wrap:anywhere]">{app.note as string}</p> : null}
        <p className="mt-1 text-xs text-plum-soft">{tr("tiktok.approvalHint")}</p>
        {admin ? (
          <form action={saveAppStatus} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
            <Field label={tr("tiktok.approvalField")} htmlFor="approval">
              <Select id="approval" name="approval" defaultValue={approved ? "approved" : "pending"}>
                <option value="pending">{tr("tiktok.approvalOptionPending")}</option>
                <option value="approved">{tr("tiktok.approvalOptionApproved")}</option>
              </Select>
            </Field>
            <Field label={tr("tiktok.ticketField")} htmlFor="ticket_date">
              <Input id="ticket_date" name="ticket_date" type="date" defaultValue={(app?.ticket_date as string | null) ?? ""} />
            </Field>
            <Field label={tr("common.note")} htmlFor="app_note">
              <Input id="app_note" name="note" maxLength={300} defaultValue={(app?.note as string | null) ?? ""} placeholder={tr("common.optional")} />
            </Field>
            <Button type="submit" variant="secondary">
              {tr("common.save")}
            </Button>
          </form>
        ) : null}
      </Card>

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
              <Button type="submit" disabled={!status.configured || !approved} title={!approved ? tr("tiktok.authorizeDisabled") : undefined}>
                {status.connected ? tr("tiktok.reauthorize") : tr("tiktok.authorize")}
              </Button>
            </form>
            {!approved ? <p className="basis-full text-xs text-plum-soft">{tr("tiktok.authorizeDisabled")}</p> : null}
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
              <ul className="divide-y divide-line lg:hidden">
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
                    <Th kind="datetime">{tr("tiktok.colWhen")}</Th>
                    <Th kind="short" priority="secondary">
                      {tr("tiktok.colTrigger")}
                    </Th>
                    <Th kind="pill">{tr("common.status")}</Th>
                    <Th kind="num">{tr("tiktok.colOrders")}</Th>
                    <Th kind="num" priority="secondary">
                      {tr("tiktok.colCancelled")}
                    </Th>
                    <Th kind="num" priority="secondary">
                      {tr("tiktok.colRefunds")}
                    </Th>
                    <Th kind="num">{tr("tiktok.colPayouts")}</Th>
                    <Th kind="num">{tr("tiktok.colQueued")}</Th>
                    <Th kind="long">{tr("tiktok.colError")}</Th>
                    <Th kind="action">
                      <span className="sr-only">{tr("table.showDetail")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <ExpandableRow
                      key={l.id}
                      label={formatDateTime(l.started_at, locale)}
                      detail={
                        <RowDetail
                          items={[
                            { label: tr("tiktok.colTrigger"), value: tr(`tiktok.trigger.${l.trigger}`), priority: "secondary" },
                            { label: tr("tiktok.colCancelled"), value: String(l.cancellations), priority: "secondary" },
                            { label: tr("tiktok.colRefunds"), value: String(l.refunds), priority: "secondary" },
                            { label: tr("tiktok.colError"), value: l.error, wide: true },
                          ]}
                        />
                      }
                    >
                      <Td kind="datetime">{formatDateTime(l.started_at, locale)}</Td>
                      <Td kind="short" priority="secondary">
                        {tr(`tiktok.trigger.${l.trigger}`)}
                      </Td>
                      <Td kind="pill">
                        <Pill tone={l.status === "ok" ? "success" : l.status === "error" ? "berry-soft" : "neutral"}>{tr(`tiktok.log.${l.status}`)}</Pill>
                      </Td>
                      <Td kind="num">{l.orders_new}</Td>
                      <Td kind="num" priority="secondary">
                        {l.cancellations}
                      </Td>
                      <Td kind="num" priority="secondary">
                        {l.refunds}
                      </Td>
                      <Td kind="num">{l.payouts}</Td>
                      <Td kind="num">{l.queued}</Td>
                      <Td kind="long" className="text-xs text-berry">
                        {l.error ?? ""}
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
