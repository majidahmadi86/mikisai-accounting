import type { Balance } from "@/lib/balance";
import type { Translator } from "@/lib/i18n/dictionary";
import { thb } from "@/lib/money";
import { cn } from "@/lib/cn";

export function BalanceBanner({ balance, tr }: { balance: Balance; tr: Translator }) {
  const owes = balance.owes;
  const headline = owes
    ? tr("dashboard.owes", { from: tr(`common.${owes.from}`), to: tr(`common.${owes.to}`), amount: thb(owes.amount) })
    : tr("dashboard.balanced");

  return (
    <section
      className={cn(
        "rounded-card border px-6 py-7 sm:px-8 sm:py-9 mb-8",
        owes ? "bg-clay-tint border-clay/25" : "bg-sage-tint border-sage/25",
      )}
    >
      <p className={cn("text-xs font-medium uppercase tracking-[0.18em]", owes ? "text-clay" : "text-sage-deep")}>{tr("dashboard.title")}</p>
      <h1 className={cn("mt-2 text-4xl sm:text-5xl leading-tight", owes ? "text-clay" : "text-sage-deep")}>{headline}</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">{tr("dashboard.bannerHint")}</p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 max-w-xl">
        {(["mike", "sai"] as const).map((p) => (
          <div key={p} className="rounded-xl bg-card/70 px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-ink-soft">{tr("dashboard.balanceOf", { name: tr(`common.${p}`) })}</dt>
            <dd className="mt-1 font-display text-2xl tabular text-ink">{thb(balance.holdings[p])}</dd>
            <dd className="text-xs text-ink-faint">{tr("dashboard.target", { amount: thb(balance.target) })}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
