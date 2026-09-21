"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n/client";
import type { TransactionInput } from "@/lib/ledger/transaction-input";
import { cn } from "@/lib/cn";
import { ExpenseSheet } from "./ExpenseSheet";
import { PayoutSheet } from "./PayoutSheet";
import { useQuickEntry, type AddKind, type AddOptions } from "./QuickEntryProvider";
import { SaleSheet } from "./SaleSheet";
import { TransferSheet } from "./TransferSheet";

export const ADD_KINDS = ["sale", "expense", "transfer", "payout"] as const;

/**
 * The one entry door. Four choices as large chips: Sale, Expense, Money
 * moved, Payout received. Importing files and screenshots is a page of its
 * own, not a way of adding by hand.
 */
export function AddSheet({ initialKind, retryInput, options }: { initialKind: AddKind; retryInput: TransactionInput | null; options: AddOptions }) {
  const t = useT();
  const { close, data, notify } = useQuickEntry();
  const [kind, setKind] = useState<AddKind>(retryInput?.type === "expense" ? "expense" : initialKind);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  const saved = (message: string) => {
    close();
    notify({ message });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="quick-entry-title">
      <button type="button" aria-label={t("quick.close")} onClick={close} className="absolute inset-0 bg-plum/45 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-ivory shadow-[0_-10px_40px_rgba(48,35,51,0.25)] md:max-h-[90vh] md:max-w-lg md:rounded-[24px]">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            <h2 id="quick-entry-title" className="text-2xl text-plum">
              {t("add.title")}
            </h2>
            <p className="text-xs text-plum-soft">{t(`add.${kind}.hint`)}</p>
          </div>
          <button type="button" onClick={close} aria-label={t("quick.close")} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint hover:text-plum">
            <CloseIcon />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 pb-3" role="radiogroup" aria-label={t("add.title")}>
          {ADD_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={k === kind} onClick={() => setKind(k)} className={cn("min-h-14 rounded-2xl border px-3 text-base font-medium transition-colors", k === kind ? "border-berry bg-berry text-ivory shadow-[0_2px_10px_rgba(143,49,95,0.3)]" : "border-line bg-card text-plum hover:bg-lavender-tint")}>
              {t(`add.${k}`)}
            </button>
          ))}
        </div>

        {kind === "sale" ? <SaleSheet onSaved={saved} onError={(message) => notify({ message })} /> : null}
        {kind === "expense" ? <ExpenseSheet retryInput={retryInput} stockFirst={Boolean(options.stockFirst)} /> : null}
        {kind === "transfer" ? <TransferSheet defaultFrom={options.transfer?.from ?? data.person} defaultAmount={options.transfer?.amount} defaultReason={options.transfer?.reason} onSaved={saved} onError={(message) => notify({ message })} /> : null}
        {kind === "payout" ? <PayoutSheet defaultPerson={data.person} /> : null}
      </div>
    </div>
  );
}
