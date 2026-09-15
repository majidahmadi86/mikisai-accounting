import Link from "next/link";
import { BalanceBanner } from "@/components/dashboard/BalanceBanner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { requireSession } from "@/lib/auth";
import { computeBalance, type BalanceTransaction } from "@/lib/balance";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone, statusName, statusTone } from "@/lib/labels";
import { formatDate, thb, todayIso } from "@/lib/money";
import { num, PEOPLE, PLATFORMS, type InternalTransfer, type SettlementStatus, type Transaction } from "@/lib/types";
import { createTransfer, deleteTransfer } from "./transfers/actions";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const [sp, { supabase }, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);

  const [{ data: txData }, { data: trData }] = await Promise.all([
    supabase.from("transactions").select("*, settlements(status)").order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("internal_transfers").select("*").order("date", { ascending: false }).limit(50),
  ]);

  const transactions = (txData ?? []).map((row) => {
    const s = Array.isArray(row.settlements) ? row.settlements[0] : row.settlements;
    return {
      ...(row as unknown as Transaction),
      gross_amount: num(row.gross_amount),
      net_amount: num(row.net_amount),
      settlement_status: (s?.status ?? null) as SettlementStatus | null,
    };
  });
  const transfers: InternalTransfer[] = (trData ?? []).map((row) => ({ ...(row as InternalTransfer), amount: num(row.amount) }));

  const balance = computeBalance(transactions as BalanceTransaction[], transfers);
  const recent = transactions.slice(0, 8);
  const pendingPlatforms = PLATFORMS.filter((p) => balance.pendingByPlatform[p].orders > 0);
  const transferError = typeof sp.transfer === "string" ? sp.transfer : null;

  return (
    <div>
      <BalanceBanner balance={balance} tr={tr} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard label={tr("dashboard.settledIncome")} value={thb(balance.settledIncome)} tone="sage" />
        <StatCard label={tr("dashboard.expenses")} value={thb(balance.expenses)} tone="clay" />
        <StatCard label={tr("dashboard.netProfit")} value={thb(balance.netProfit)} />
        <StatCard label={tr("dashboard.share")} value={thb(balance.target)} hint="50 / 50" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader title={tr("dashboard.pendingTitle")} subtitle={tr("dashboard.pendingSubtitle")} />
          <div className="px-6 pb-6">
            {pendingPlatforms.length === 0 ? (
              <p className="text-sm text-ink-soft">{tr("dashboard.pendingNone")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {pendingPlatforms.map((p) => {
                  const b = balance.pendingByPlatform[p];
                  return (
                    <li key={p} className="flex items-center justify-between py-3">
                      <div>
                        <Pill tone={platformTone(p)}>{platformName(tr, p)}</Pill>
                        <p className="mt-1 text-xs text-ink-faint">
                          {b.orders} {tr("common.orders")}
                          {b.settled_not_withdrawn > 0 ? ` · ${statusName(tr, "settled_not_withdrawn")} ${thb(b.settled_not_withdrawn)}` : ""}
                        </p>
                      </div>
                      <span className="font-display text-xl tabular text-[#8a6620]">{thb(b.total)}</span>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between pt-3 text-sm">
                  <span className="text-ink-soft">{tr("common.total")}</span>
                  <span className="font-medium tabular">{thb(balance.pendingTotal)}</span>
                </li>
              </ul>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title={tr("dashboard.recentTitle")}
            action={
              <Link href="/transactions" className="text-sm text-sage-deep hover:underline whitespace-nowrap">
                {tr("common.viewAll")} →
              </Link>
            }
          />
          <div className="px-6 pb-6">
            {recent.length === 0 ? (
              <p className="text-sm text-ink-soft">{tr("dashboard.recentNone")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">
                        {row.type === "income" ? (row.customer_name || platformName(tr, row.platform)) : row.note || (row.category ? tr(`category.${row.category}`) : tr("common.expense"))}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {formatDate(row.date, locale)} · {row.type === "income" ? tr(`common.${row.received_by ?? "mike"}`) : tr(`common.${row.payer ?? "mike"}`)}
                        {row.type === "income" && row.settlement_status ? (
                          <>
                            {" "}
                            · <Pill tone={statusTone(row.settlement_status)} className="px-2 py-0 text-[10px]">{statusName(tr, row.settlement_status)}</Pill>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <span className={`tabular font-medium ${row.type === "expense" ? "text-clay" : "text-sage-deep"}`}>
                      {row.type === "expense" ? "-" : "+"}
                      {thb(row.net_amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={tr("dashboard.transfersTitle")} subtitle={tr("dashboard.transfersSubtitle")} />
        <div className="grid gap-6 px-6 pb-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {transfers.length === 0 ? (
              <p className="text-sm text-ink-soft">{tr("dashboard.transfersNone")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {transfers.map((tf) => {
                  const remove = deleteTransfer.bind(null, tf.id);
                  return (
                    <li key={tf.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm text-ink">
                          {tr(`common.${tf.from_person}`)} → {tr(`common.${tf.to_person}`)}
                          <span className="ml-2 font-medium tabular">{thb(tf.amount)}</span>
                        </p>
                        <p className="text-xs text-ink-faint">
                          {formatDate(tf.date, locale)}
                          {tf.note ? ` · ${tf.note}` : ""}
                        </p>
                      </div>
                      <form action={remove}>
                        <DeleteButton variant="ghost" className="px-2 py-1 text-xs" />
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <form action={createTransfer} className="lg:col-span-2 rounded-xl bg-porcelain-deep/60 p-4 space-y-3">
            <p className="text-sm font-medium text-ink">{tr("transfer.title")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tr("transfer.from")} htmlFor="from_person">
                <Select id="from_person" name="from_person" defaultValue="mike">
                  {PEOPLE.map((p) => (
                    <option key={p} value={p}>
                      {tr(`common.${p}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tr("transfer.to")} htmlFor="to_person">
                <Select id="to_person" name="to_person" defaultValue="sai">
                  {PEOPLE.map((p) => (
                    <option key={p} value={p}>
                      {tr(`common.${p}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tr("common.amount")} htmlFor="amount">
                <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
              </Field>
              <Field label={tr("common.date")} htmlFor="tdate">
                <Input id="tdate" name="date" type="date" required defaultValue={todayIso()} />
              </Field>
            </div>
            <Field label={tr("common.note")} htmlFor="tnote">
              <Textarea id="tnote" name="note" className="min-h-16" />
            </Field>
            {transferError ? <p className="text-xs text-clay">{tr("common.error")}</p> : null}
            <div className="flex justify-end">
              <Button type="submit" variant="secondary">
                {tr("dashboard.addTransfer")}
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <div className="mt-8 flex flex-wrap gap-2">
        <ButtonLink href="/transactions/new?type=income">{tr("transactions.addIncome")}</ButtonLink>
        <ButtonLink href="/transactions/new?type=expense" variant="secondary">
          {tr("transactions.addExpense")}
        </ButtonLink>
        <ButtonLink href="/payouts/new" variant="secondary">
          {tr("payouts.new")}
        </ButtonLink>
        <ButtonLink href="/import" variant="ghost">
          {tr("import.title")} ↗
        </ButtonLink>
      </div>
    </div>
  );
}
