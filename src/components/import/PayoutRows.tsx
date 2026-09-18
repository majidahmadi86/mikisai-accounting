"use client";

import { Pill } from "@/components/ui/Pill";
import { useLocale, useT } from "@/lib/i18n/client";
import { platformName, platformTone } from "@/lib/labels";
import { formatDate, thb } from "@/lib/money";
import type { PayoutRow } from "@/lib/parse/schema";
import { cn } from "@/lib/cn";

/** Payouts found on wallet screens or in a finance export: each creates a payout and matches the oldest unpaid orders on confirm. */
export function PayoutRows({ rows, onChange }: { rows: PayoutRow[]; onChange: (rows: PayoutRow[]) => void }) {
  const t = useT();
  const locale = useLocale();
  if (!rows.length) return null;
  const patch = (key: string, changes: Partial<PayoutRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  return (
    <div className="rounded-card border border-line bg-card">
      <div className="border-b border-line px-4 py-3">
        <p className="font-display text-lg text-plum">{t("import.payoutsTitle", { n: rows.length })}</p>
        <p className="text-xs text-plum-soft">{t("import.payoutsHint")}</p>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !r.include && "opacity-60")}>
            <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-plum">
              <input type="checkbox" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} className="h-5 w-5 accent-[#8f315f]" aria-label={t("import.include")} />
              {thb(r.amount)}
            </label>
            <Pill tone={platformTone(r.platform)}>{platformName(t, r.platform)}</Pill>
            <input type="date" value={r.date} onChange={(e) => patch(r.key, { date: e.target.value || r.date })} className="min-h-9 rounded-lg border border-line bg-card px-2 text-sm text-plum" aria-label={t("common.date")} />
            <span className="text-xs text-plum-soft">
              {r.matched_orders > 0 ? t("import.payoutMatch", { n: r.matched_orders, amount: thb(r.matched_total) }) : t("import.payoutNoMatch")}
              {r.clawback_offset > 0 ? ` · ${t("payouts.clawbackOffsets", { amount: thb(r.clawback_offset), total: thb(r.amount + r.clawback_offset) })}` : ""}
            </span>
            {r.note ? <span className="text-xs text-plum-faint">{r.note}</span> : null}
            <span className="ml-auto text-xs text-plum-faint">{formatDate(r.date, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
