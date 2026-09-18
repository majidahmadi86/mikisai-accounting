import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { SoftDeleteButton } from "@/components/ui/SoftDeleteButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoTip } from "@/components/ui/InfoTip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { StackedItem, StackedList } from "@/components/ui/StackedList";
import { ExpandableNote } from "@/components/ui/ExpandableNote";
import { Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone } from "@/lib/labels";
import { formatDate, round2, thb } from "@/lib/money";
import { num, type Payout } from "@/lib/types";
import { summarisePayoutMatches } from "@/lib/payouts/flags";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { clawbackPending } from "@/lib/truth";
import { Card } from "@/components/ui/Card";

export default async function PayoutsPage() {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const { supabase } = session;
  const admin = session.profile.role === "admin";
  const tr = t(locale);

  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const pendingClawbacks = clawbackPending(snapshot);
  const [{ data: payouts }, { data: matched }] = await Promise.all([
    supabase.from("payouts").select("*").is("deleted_at", null).order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("settlements").select("payout_id, deleted_at, transactions(net_amount)").not("payout_id", "is", null),
  ]);

  // A sale deleted after it was matched leaves its settlement pointing at the payout until someone re-confirms.
  const byPayout = summarisePayoutMatches(
    (matched ?? []).map((s) => {
      const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
      return { payout_id: s.payout_id, deleted_at: s.deleted_at ?? null, net_amount: num(tx?.net_amount) };
    }),
  );

  const rows = ((payouts ?? []) as Payout[]).map((p) => {
    const m = byPayout.get(p.id);
    return { ...p, amount_received: num(p.amount_received), match: m && m.count > 0 ? m : undefined, removed: m && m.removed > 0 ? m : undefined };
  });

  function Status({ p }: { p: (typeof rows)[number] }) {
    const diff = p.match ? round2(p.match.total - p.amount_received) : null;
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {p.match ? <Pill tone="success">{tr("payouts.reconciled", { n: p.match.count })}</Pill> : <Pill tone="lavender">{tr("payouts.unreconciled")}</Pill>}
        {p.match && diff !== null && Math.abs(diff) >= 0.01 ? (
          <span className="text-xs text-plum-faint tabular">
            {diff > 0 ? "+" : ""}
            {thb(diff)}
          </span>
        ) : null}
        {p.removed ? (
          <>
            <Pill tone="warning">{tr("payouts.removed", { n: p.removed.removed, amount: thb(p.removed.unallocated) })}</Pill>
            <Pill tone="berry-soft">{tr("payouts.reconfirm")}</Pill>
          </>
        ) : null}
      </span>
    );
  }

  return (
    <div>
      <PageHeader title={tr("payouts.title")} subtitle={tr("payouts.subtitle")} action={<ButtonLink href="/payouts/new">{tr("payouts.new")}</ButtonLink>} />
      {pendingClawbacks > 0 ? (
        <Card tone="warning" className="mb-4 px-5 py-4">
          <p className="text-sm font-medium text-warning-ink">{tr("orders.clawbackPending", { amount: thb(pendingClawbacks) })}</p>
          <p className="mt-1 text-xs text-plum-soft">{tr("orders.clawbackHint")}</p>
        </Card>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={tr("payouts.empty")} body={tr("payouts.emptyBody")} action={<ButtonLink href="/payouts/new">{tr("payouts.new")}</ButtonLink>} />
      ) : (
        <>
          <StackedList>
            {rows.map((p) => {
              return (
                <StackedItem key={p.id}>
                  <Link href={`/payouts/${p.id}/edit`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <Pill tone={platformTone(p.platform)}>{platformName(tr, p.platform)}</Pill>
                        <span className="text-xs text-plum-faint">
                          {formatDate(p.date, locale)} · {tr(`common.${p.received_by}`)}
                        </span>
                      </p>
                      <p className="mt-2">
                        <Status p={p} />
                      </p>
                      {p.note ? <ExpandableNote text={p.note} className="mt-1 text-xs text-plum-soft" /> : null}
                    </div>
                    <p className="shrink-0 font-medium text-xl tabular text-plum">{thb(p.amount_received)}</p>
                  </Link>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
                    <Link href={`/payouts/${p.id}/reconcile`} className="inline-flex min-h-11 items-center text-sm font-medium text-berry">
                      {tr("payouts.reconcile")} →
                    </Link>
                    {admin ? <SoftDeleteButton entity="payout" id={p.id} variant="ghost" className="px-3 text-xs" /> : null}
                  </div>
                </StackedItem>
              );
            })}
          </StackedList>

          <Table>
            <thead>
              <tr>
                <Th>{tr("common.date")}</Th>
                <Th>{tr("common.platform")}</Th>
                <Th>{tr("payouts.receivedBy")}</Th>
                <Th align="right">{tr("payouts.amountReceived")}</Th>
                <Th>
                  <span className="inline-flex items-center gap-1">
                    {tr("common.status")} <InfoTip text={tr("payouts.tipStatus")} />
                  </span>
                </Th>
                <Th>{tr("common.note")}</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                  return (
                  <tr key={p.id} className="hover:bg-lavender-tint">
                    <Td className="whitespace-nowrap">{formatDate(p.date, locale)}</Td>
                    <Td>
                      <Pill tone={platformTone(p.platform)}>{platformName(tr, p.platform)}</Pill>
                    </Td>
                    <Td>{tr(`common.${p.received_by}`)}</Td>
                    <Td align="right" className="font-medium">
                      {thb(p.amount_received)}
                    </Td>
                    <Td>
                      <Status p={p} />
                    </Td>
                    <Td className="max-w-56 text-plum-soft">{p.note ? <ExpandableNote text={p.note} /> : null}</Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/payouts/${p.id}/edit`} className="text-xs text-berry hover:underline whitespace-nowrap">
                          {tr("common.edit")} →
                        </Link>
                        <Link href={`/payouts/${p.id}/reconcile`} className="text-xs text-berry hover:underline whitespace-nowrap">
                          {tr("payouts.reconcile")} →
                        </Link>
                        {admin ? <SoftDeleteButton entity="payout" id={p.id} variant="ghost" className="px-2 text-xs" /> : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
