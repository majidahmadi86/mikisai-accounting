"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reinstateOrder, setOrderStatus } from "@/app/(app)/transactions/status-actions";
import { Pill } from "@/components/ui/Pill";
import { useT } from "@/lib/i18n/client";
import { thb, todayIso } from "@/lib/money";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const stop = (e: React.SyntheticEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

/**
 * One tap from a ledger row: Mark cancelled. Opens a small form for the
 * reason, the day and, for a refund, the amount the platform takes back.
 * A cancelled or refunded row shows its state and, for the admin, Reinstate.
 */
export function OrderStatusButton({ id, status, refund, netAmount, admin, compact = false }: { id: string; status: OrderStatus; refund: number | null; netAmount: number; admin: boolean; compact?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"cancelled" | "refunded">("cancelled");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (status !== "active") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5" onClick={stop}>
        <Pill tone="berry-soft">{status === "cancelled" ? t("orders.cancelled") : t("orders.refunded", { amount: thb(refund ?? 0) })}</Pill>
        {admin ? (
          <button
            type="button"
            disabled={pending}
            onClick={(e) => {
              stop(e);
              start(async () => {
                const r = await reinstateOrder(id);
                if (!r.ok) setError(t("orders.cannotReinstate"));
                else router.refresh();
              });
            }}
            className="min-h-8 text-xs font-medium text-berry hover:underline disabled:opacity-50"
          >
            {t("orders.reinstate")}
          </button>
        ) : null}
        {error ? <span className="text-xs text-berry">{error}</span> : null}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen(true);
        }}
        className={cn("inline-flex min-h-8 items-center rounded-full border border-line bg-card px-2.5 text-xs font-medium text-plum-soft hover:border-berry hover:text-berry", compact && "min-h-7")}
      >
        {t("orders.markCancelled")}
      </button>
    );
  }

  const refundValue = kind === "refunded" ? Number(amount.replace(/[,\s฿]/g, "")) : netAmount;
  const valid = kind === "cancelled" || (Number.isFinite(refundValue) && refundValue > 0 && refundValue <= netAmount);

  return (
    <form
      onClick={stop}
      onSubmit={(e) => {
        stop(e);
        if (!valid) return setError(t("orders.refundInvalid", { max: thb(netAmount) }));
        setError(null);
        start(async () => {
          const r = await setOrderStatus(id, { status: kind, date, reason, refund_amount: kind === "refunded" ? refundValue : null });
          if (!r.ok) return setError(r.reason === "denied" ? t("roles.denied") : t("common.error"));
          setOpen(false);
          router.refresh();
        });
      }}
      className="mt-1 grid w-full max-w-sm gap-2 rounded-2xl border border-berry/30 bg-berry-tint/40 p-3 text-left"
    >
      <div role="radiogroup" aria-label={t("orders.kind")} className="flex gap-1.5">
        {(["cancelled", "refunded"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("min-h-9 flex-1 rounded-full border px-3 text-xs font-medium", kind === k ? "border-berry bg-berry text-ivory" : "border-line bg-card text-plum")}>
            {k === "cancelled" ? t("orders.kindCancelled") : t("orders.kindRefunded")}
          </button>
        ))}
      </div>
      {kind === "refunded" ? (
        <label className="block text-xs text-plum">
          {t("orders.refundAmount")}
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={thb(netAmount)} className="mt-1 min-h-9 w-full rounded-lg border border-line bg-card px-2.5 text-sm tabular text-plum focus:border-berry focus:outline-none" />
          <span className="mt-0.5 block text-[11px] text-plum-faint">{t("orders.refundHint")}</span>
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-plum">
          {t("orders.dateLabel")}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1 min-h-9 w-full rounded-lg border border-line bg-card px-2 text-sm text-plum focus:border-berry focus:outline-none" />
        </label>
        <label className="block text-xs text-plum">
          {t("orders.reasonLabel")}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("common.optional")} className="mt-1 min-h-9 w-full rounded-lg border border-line bg-card px-2 text-sm text-plum focus:border-berry focus:outline-none" />
        </label>
      </div>
      {error ? <p className="text-xs text-berry">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-9 flex-1 rounded-full bg-berry px-3 text-xs font-medium text-ivory disabled:opacity-50">
          {kind === "cancelled" ? t("orders.confirmCancel") : t("orders.confirmRefund")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-full border border-line bg-card px-3 text-xs text-plum-soft">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
