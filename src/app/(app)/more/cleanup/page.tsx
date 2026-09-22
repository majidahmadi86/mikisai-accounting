import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { loadCleanup, type WeekCount } from "@/lib/ledger/cleanup-server";
import { formatDate, thb, todayIso } from "@/lib/money";
import { weekOf } from "@/lib/week";
import { runCleanup } from "./actions";

/**
 * Clean the ledger against TikTok's own Orders files: duplicates, rows typed
 * by hand that an import already has, cancellations that never shipped, and
 * sales on the wrong variant. Shows every change with before and after, and
 * changes nothing until the admin confirms.
 */
export default async function CleanupPage({ searchParams }: PageProps<"/more/cleanup">) {
  const [sp, { supabase, profile }, locale] = await Promise.all([searchParams, requireAdmin("report"), getLocale()]);
  const tr = t(locale);
  const week = weekOf(typeof sp.from === "string" ? sp.from : null, todayIso());
  const view = await loadCleanup(supabase, profile.business_id, week);
  const { plan } = view;
  const row = (id: string) => view.rows.get(id);
  const name = (id: string) => view.products.get(id) ?? "?";
  const count = plan.exactDuplicates.reduce((a, d) => a + d.remove.length, 0) + plan.merges.length + plan.cancelBeforeShipping.length + plan.remaps.length;

  // What the week will look like once the plan is applied.
  const after: WeekCount = { orders: view.before.orders, units: { ...view.before.units }, cancelled: view.before.cancelled };
  const inWeek = (id: string) => {
    const r = row(id);
    return Boolean(r && r.date >= week.from && r.date <= week.to);
  };
  const drop = (id: string) => {
    const r = row(id);
    if (!r || !inWeek(id) || r.status !== "active") return;
    after.orders -= 1;
    for (const i of r.items) after.units[i.product_id] = (after.units[i.product_id] ?? 0) - i.qty;
  };
  plan.exactDuplicates.forEach((d) => d.remove.forEach(drop));
  plan.merges.forEach((m) => drop(m.remove));
  for (const c of plan.cancelBeforeShipping) {
    drop(c.id);
    if (inWeek(c.id)) after.cancelled += 1;
  }
  for (const m of plan.remaps) {
    const r = row(m.id);
    if (!r || !inWeek(m.id) || r.status !== "active" || plan.cancelBeforeShipping.some((c) => c.id === m.id)) continue;
    const q = r.items.reduce((a, i) => a + i.qty, 0);
    after.units[m.from] = (after.units[m.from] ?? 0) - q;
    after.units[m.to] = (after.units[m.to] ?? 0) + q;
  }
  const units = (w: WeekCount) =>
    Object.entries(w.units)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `${n} ${name(id)}`)
      .join(" · ") || "·";
  const done = typeof sp.done === "string" ? sp.done.split(".").map(Number) : null;

  return (
    <div className="max-w-3xl">
      <PageHeader title={tr("cleanup.title")} subtitle={tr("cleanup.subtitle", { n: view.ordersFiles })} />
      {done ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("cleanup.done", { removed: done[0], cancelled: done[1], remapped: done[2] })}{done[3] ? ` ${tr("cleanup.errors", { n: done[3] })}` : ""}</p> : null}

      <Card className="mb-4 px-5 py-4">
        <p className="eyebrow">{tr("week.range", { from: formatDate(week.from, locale), to: formatDate(week.to, locale) })}</p>
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-plum-faint">{tr("cleanup.before")}</dt>
            <dd className="text-plum" data-testid="cleanup-before">{tr("cleanup.count", { orders: view.before.orders, units: units(view.before), cancelled: view.before.cancelled })}</dd>
          </div>
          <div>
            <dt className="text-plum-faint">{tr("cleanup.after")}</dt>
            <dd className="font-medium text-plum" data-testid="cleanup-after">{tr("cleanup.count", { orders: after.orders, units: units(after), cancelled: after.cancelled })}</dd>
          </div>
        </dl>
      </Card>

      <div className="space-y-3">
        <Card className="px-5 py-4">
          <h2 className="text-lg text-plum">{tr("cleanup.merges", { n: plan.merges.length + plan.exactDuplicates.length })}</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-plum-soft">
            {plan.exactDuplicates.map((d) => (
              <li key={d.order_ref}>{tr("cleanup.exactLine", { ref: d.order_ref, n: d.remove.length })}</li>
            ))}
            {plan.merges.map((m) => {
              const r = row(m.remove);
              return <li key={m.remove}>{tr("cleanup.mergeLine", { date: r ? formatDate(r.date, locale) : "", amount: thb(r?.gross_amount ?? 0), ref: m.order_ref })}</li>;
            })}
          </ul>
        </Card>

        {plan.unmatched.length ? (
          <Card tone="warning" className="px-5 py-4">
            <h2 className="text-lg text-plum">{tr("cleanup.unmatched", { n: plan.unmatched.length })}</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {plan.unmatched.map((u) => (
                <li key={u.id}>
                  <Link href={`/transactions/${u.id}/edit`} className="text-berry hover:underline">
                    {formatDate(u.date, locale)} · {u.quantity} · {thb(u.gross_amount)} →
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="px-5 py-4">
          <h2 className="text-lg text-plum">{tr("cleanup.cancelled", { n: plan.cancelBeforeShipping.length })}</h2>
          <ul className="mt-2 space-y-1 font-mono text-xs text-plum-soft">
            {plan.cancelBeforeShipping.map((c) => (
              <li key={c.id}>#{c.order_ref}</li>
            ))}
          </ul>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-lg text-plum">{tr("cleanup.remaps", { n: plan.remaps.length })}</h2>
          <ul className="mt-2 space-y-1 text-xs text-plum-soft">
            {plan.remaps.map((m) => (
              <li key={m.id}>
                <span className="font-mono">#{m.order_ref}</span> · {name(m.from)} → {name(m.to)}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <form action={runCleanup} className="mt-5">
        <input type="hidden" name="from" value={week.from} />
        <Button type="submit" disabled={count === 0} className="min-h-12 w-full text-base sm:w-auto">
          {count === 0 ? tr("cleanup.nothing") : tr("cleanup.apply", { n: count })}
        </Button>
      </form>
    </div>
  );
}
