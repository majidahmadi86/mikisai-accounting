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
    <section className={cn("mb-6 rounded-card border px-5 py-6 sm:mb-8 sm:px-8 sm:py-9", owes ? "bg-berry-tint border-berry/15" : "bg-success-tint border-success/20")}>
      <p className={cn("eyebrow", owes ? "text-berry" : "text-success")}>{tr("dashboard.title")}</p>
      <h1 className={cn("mt-2 text-3xl leading-tight sm:text-5xl", owes ? "text-berry" : "text-success")}>{headline}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-plum-soft">{tr("dashboard.bannerHint")}</p>
      <dl className="mt-5 grid max-w-xl grid-cols-2 gap-3 sm:mt-6 sm:gap-4">
        {(["mike", "sai"] as const).map((p) => (
          <div key={p} className="rounded-xl bg-card/80 px-4 py-3">
            <dt className="eyebrow">{tr("dashboard.balanceOf", { name: tr(`common.${p}`) })}</dt>
            <dd className="mt-1 font-display text-xl tabular text-plum sm:text-2xl">{thb(balance.holdings[p])}</dd>
            <dd className="text-xs text-plum-faint">{tr("dashboard.target", { amount: thb(balance.target) })}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
