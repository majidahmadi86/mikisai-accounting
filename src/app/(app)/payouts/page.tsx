import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone } from "@/lib/labels";
import { formatDate, round2, thb } from "@/lib/money";
import { num, type Payout } from "@/lib/types";
import { deletePayout } from "./actions";

export default async function PayoutsPage() {
  const [{ supabase }, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);

  const [{ data: payouts }, { data: matched }] = await Promise.all([
    supabase.from("payouts").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("settlements").select("payout_id, transactions(net_amount)").not("payout_id", "is", null),
  ]);

  const byPayout = new Map<string, { count: number; total: number }>();
  for (const s of matched ?? []) {
    if (!s.payout_id) continue;
    const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
    const cur = byPayout.get(s.payout_id) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total = round2(cur.total + num(tx?.net_amount));
    byPayout.set(s.payout_id, cur);
  }

  const rows = ((payouts ?? []) as Payout[]).map((p) => ({ ...p, amount_received: num(p.amount_received), match: byPayout.get(p.id) }));

  return (
    <div>
      <PageHeader title={tr("payouts.title")} subtitle={tr("payouts.subtitle")} action={<ButtonLink href="/payouts/new">{tr("payouts.new")}</ButtonLink>} />
      {rows.length === 0 ? (
        <EmptyState title={tr("payouts.empty")} action={<ButtonLink href="/payouts/new">{tr("payouts.new")}</ButtonLink>} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{tr("common.date")}</Th>
              <Th>{tr("common.platform")}</Th>
              <Th>{tr("payouts.receivedBy")}</Th>
              <Th align="right">{tr("payouts.amountReceived")}</Th>
              <Th>{tr("common.status")}</Th>
              <Th>{tr("common.note")}</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const remove = deletePayout.bind(null, p.id);
              const diff = p.match ? round2(p.match.total - p.amount_received) : null;
              return (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{formatDate(p.date, locale)}</Td>
                  <Td>
                    <Pill tone={platformTone(p.platform)}>{platformName(tr, p.platform)}</Pill>
                  </Td>
                  <Td>{tr(`common.${p.received_by}`)}</Td>
                  <Td align="right" className="font-medium">
                    {thb(p.amount_received)}
                  </Td>
                  <Td>
                    {p.match ? (
                      <span className="inline-flex items-center gap-2">
                        <Pill tone="success">{tr("payouts.reconciled", { n: p.match.count })}</Pill>
                        {diff !== null && Math.abs(diff) >= 0.01 ? <span className="text-xs text-plum-faint tabular">{diff > 0 ? "+" : ""}{thb(diff)}</span> : null}
                      </span>
                    ) : (
                      <Pill tone="lavender">{tr("payouts.unreconciled")}</Pill>
                    )}
                  </Td>
                  <Td className="text-plum-soft max-w-56 truncate">{p.note}</Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/payouts/${p.id}/reconcile`} className="text-xs text-berry hover:underline whitespace-nowrap">
                        {tr("payouts.reconcile")} →
                      </Link>
                      <form action={remove}>
                        <DeleteButton variant="ghost" className="px-2 py-1 text-xs" />
                      </form>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
