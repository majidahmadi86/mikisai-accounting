"use client";

import { useEffect, useState } from "react";
import { createTransfer } from "@/app/(app)/transfers/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { CloseIcon } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n/client";
import { thb } from "@/lib/money";
import type { Person } from "@/lib/types";

/**
 * "Mark as sent": opens the internal transfer form already filled in with
 * today's action. Nothing is recorded until Confirm transfer is tapped.
 */
export function MarkAsSent({ from, to, amount, today }: { from: Person; to: Person; amount: number; today: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div>
        <Button type="button" onClick={() => setOpen(true)}>
          {t("balance.markSent")}
        </Button>
        <p className="mt-1.5 text-xs text-plum-soft">{t("balance.markSentHint")}</p>
      </div>
      {open ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="mark-sent-title">
          <button type="button" aria-label={t("quick.close")} onClick={() => setOpen(false)} className="absolute inset-0 bg-plum/45 backdrop-blur-[2px]" />
          <div className="relative w-full max-w-md rounded-t-[24px] bg-ivory p-5 shadow-[0_-10px_40px_rgba(48,35,51,0.25)] md:rounded-[24px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">{t("transfer.kindSettlement")}</p>
                <h2 id="mark-sent-title" className="text-2xl text-plum">
                  {t("transfer.title")}
                </h2>
                <p className="text-xs text-plum-soft">{t("balance.actionSend", { from: t(`common.${from}`), to: t(`common.${to}`), amount: thb(amount) })}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("quick.close")} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint">
                <CloseIcon />
              </button>
            </div>
            <form action={createTransfer} className="mt-4 space-y-3">
              <input type="hidden" name="reason" value="profit_settlement" />
              <input type="hidden" name="redirect_to" value="/balance" />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("transfer.from")} htmlFor="ms-from">
                  <Input id="ms-from" name="from_person" value={from} readOnly className="bg-ivory-deep" />
                </Field>
                <Field label={t("transfer.to")} htmlFor="ms-to">
                  <Input id="ms-to" name="to_person" value={to} readOnly className="bg-ivory-deep" />
                </Field>
                <Field label={t("common.amount")} htmlFor="ms-amount" hint={t("transfer.amountHint")}>
                  <Input id="ms-amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={amount} required className="tabular text-lg" />
                </Field>
                <Field label={t("common.date")} htmlFor="ms-date" hint={t("transfer.dateHint")}>
                  <Input id="ms-date" name="date" type="date" defaultValue={today} required />
                </Field>
              </div>
              <Field label={t("common.note")} htmlFor="ms-note">
                <Textarea id="ms-note" name="note" className="min-h-16" placeholder={t("common.optional")} />
              </Field>
              <div className="flex gap-2 pt-1">
                <Button type="submit" className="flex-1">
                  {t("balance.confirmTransfer")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
