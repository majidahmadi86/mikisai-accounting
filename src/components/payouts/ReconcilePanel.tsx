"use client";

import { useMemo, useState, useTransition } from "react";
import { confirmPayoutMatch } from "@/app/(app)/payouts/actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Table, Td, Th } from "@/components/ui/Table";
import { isWithinTolerance, PAYOUT_TOLERANCE } from "@/lib/fifo";
import { useT } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/dictionary";
import { statusName, statusTone } from "@/lib/labels";
import { formatDate, round2, thb } from "@/lib/money";
import type { ProductLine, SettlementStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export type ReconcileCandidate = {
  settlement_id: string;
  transaction_id: string;
  status: SettlementStatus;
  linked: boolean;
  date: string;
  created_at: string;
  net_amount: number;
  gross_amount: number;
  customer_name: string | null;
  product_line: ProductLine;
};

export function ReconcilePanel({
  payoutId,
  amountReceived,
  candidates,
  initialSelected,
  locale,
}: {
  payoutId: string;
  amountReceived: number;
  candidates: ReconcileCandidate[];
  initialSelected: string[];
  locale: Locale;
}) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [pending, startTransition] = useTransition();

  const total = useMemo(() => round2(candidates.filter((c) => selected.has(c.settlement_id)).reduce((sum, c) => sum + c.net_amount, 0)), [candidates, selected]);
  const difference = round2(total - amountReceived);
  const within = isWithinTolerance(total, amountReceived);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (candidates.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-plum-soft">{t("payouts.noCandidates")}</p>
        <div className="mt-4">
          <ButtonLink href="/payouts" variant="ghost">
            {t("common.back")}
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card tone={within ? "success" : "warning"} className="sticky top-[4.25rem] z-10 px-5 py-4 md:static">
        <p className={cn("text-sm font-medium", within ? "text-success" : "text-warning-ink")}>{within ? t("payouts.proposedMatch") : t("payouts.noMatch")}</p>
        {!within && total > amountReceived && selected.size > 0 ? <p className="mt-1 text-xs text-plum-soft">{t("payouts.partialHint", { paid: thb(amountReceived), rest: thb(Math.round((total - amountReceived) * 100) / 100) })}</p> : null}
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="eyebrow">{t("payouts.amountReceived")}</dt>
            <dd className="font-medium text-lg tabular sm:text-xl">{thb(amountReceived)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t("payouts.selectedTotal")}</dt>
            <dd className="font-medium text-lg tabular sm:text-xl">{thb(total)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t("payouts.difference")}</dt>
            <dd className={cn("font-medium text-lg tabular sm:text-xl", within ? "text-success" : "text-berry")}>
              {difference > 0 ? "+" : ""}
              {thb(difference)}
            </dd>
            <dd className="text-xs text-plum-faint">{t("payouts.tolerance", { pct: `±${PAYOUT_TOLERANCE * 100}%` })}</dd>
          </div>
        </dl>
      </Card>

      <ul className="space-y-2 md:hidden">
        {candidates.map((c) => {
          const checked = selected.has(c.settlement_id);
          return (
            <li key={c.settlement_id}>
              <button
                type="button"
                onClick={() => toggle(c.settlement_id)}
                aria-pressed={checked}
                className={cn("flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left transition-colors", checked ? "border-berry bg-lavender-tint" : "border-line bg-card")}
              >
                <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-ivory", checked ? "border-berry bg-berry" : "border-plum-faint bg-card")} aria-hidden="true">
                  {checked ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-plum">{c.customer_name ?? t(`product.${c.product_line}`)}</span>
                    <span className="shrink-0 tabular font-medium text-plum">{thb(c.net_amount)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-plum-faint">
                    {formatDate(c.date, locale)} · {t(`product.${c.product_line}`)} · {t("common.gross")} {thb(c.gross_amount)}
                  </span>
                  <span className="mt-1.5 block">
                    <Pill tone={statusTone(c.status)}>{statusName(t, c.status)}</Pill>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Table>
        <thead>
          <tr>
            <Th className="w-10"></Th>
            <Th>{t("common.date")}</Th>
            <Th>{t("common.customer")}</Th>
            <Th>{t("common.product")}</Th>
            <Th>{t("common.status")}</Th>
            <Th align="right">{t("common.gross")}</Th>
            <Th align="right">{t("common.net")}</Th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const checked = selected.has(c.settlement_id);
            return (
              <tr key={c.settlement_id} onClick={() => toggle(c.settlement_id)} className={cn("cursor-pointer", checked ? "bg-lavender-tint" : "hover:bg-ivory-deep/60")}>
                <Td>
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.settlement_id)} onClick={(e) => e.stopPropagation()} className="h-5 w-5 accent-[#8f315f]" aria-label={c.customer_name ?? c.transaction_id} />
                </Td>
                <Td className="whitespace-nowrap">{formatDate(c.date, locale)}</Td>
                <Td className="text-plum-soft">{c.customer_name ?? ""}</Td>
                <Td className="text-plum-soft">{t(`product.${c.product_line}`)}</Td>
                <Td>
                  <Pill tone={statusTone(c.status)}>{statusName(t, c.status)}</Pill>
                </Td>
                <Td align="right" className="text-plum-faint">
                  {thb(c.gross_amount)}
                </Td>
                <Td align="right" className="font-medium">
                  {thb(c.net_amount)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="sticky bottom-20 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-ivory/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="button" className="flex-1 md:flex-none" disabled={pending || selected.size === 0} onClick={() => startTransition(() => confirmPayoutMatch(payoutId, Array.from(selected)))}>
          {t("payouts.confirmMatch")}
        </Button>
        <ButtonLink href="/payouts" variant="ghost">
          {t("common.cancel")}
        </ButtonLink>
        <span className="w-full text-xs text-plum-faint md:w-auto">{t("payouts.selectedCount", { n: selected.size })}</span>
      </div>
    </div>
  );
}
