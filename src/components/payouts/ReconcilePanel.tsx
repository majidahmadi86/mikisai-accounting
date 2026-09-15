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
      <Card tone={within ? "success" : "warning"} className="px-6 py-4">
        <p className={cn("text-sm font-medium", within ? "text-success" : "text-warning")}>
          {within ? t("payouts.proposedMatch") : t("payouts.noMatch")}
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-plum-soft">{t("payouts.amountReceived")}</dt>
            <dd className="font-display text-xl tabular">{thb(amountReceived)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-plum-soft">{t("payouts.selectedTotal")}</dt>
            <dd className="font-display text-xl tabular">{thb(total)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-plum-soft">{t("payouts.difference")}</dt>
            <dd className={cn("font-display text-xl tabular", within ? "text-success" : "text-berry")}>
              {difference > 0 ? "+" : ""}
              {thb(difference)}
            </dd>
            <dd className="text-xs text-plum-faint">{t("payouts.tolerance", { pct: `±${PAYOUT_TOLERANCE * 100}%` })}</dd>
          </div>
        </dl>
      </Card>

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
              <tr key={c.settlement_id} onClick={() => toggle(c.settlement_id)} className={cn("cursor-pointer", checked ? "bg-lavender-tint/40" : "hover:bg-ivory/60")}>
                <Td>
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.settlement_id)} onClick={(e) => e.stopPropagation()} className="accent-[#8f315f]" aria-label={c.customer_name ?? c.transaction_id} />
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={() => startTransition(() => confirmPayoutMatch(payoutId, Array.from(selected)))}
        >
          {t("payouts.confirmMatch")}
        </Button>
        <ButtonLink href="/payouts" variant="ghost">
          {t("common.cancel")}
        </ButtonLink>
        <span className="text-xs text-plum-faint">
          {selected.size} {t("common.orders")}
        </span>
      </div>
    </div>
  );
}
