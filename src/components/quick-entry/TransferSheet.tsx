"use client";

import { useState } from "react";
import { quickAddTransfer } from "@/app/(app)/transfers/actions";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import { round2, thb, todayIso } from "@/lib/money";
import { PEOPLE, TRANSFER_REASONS, type Person, type TransferReason } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Record an internal transfer from the bottom sheet. Reason chips sit in one
 * column on narrow screens and two above 640px, and wrap only at word
 * boundaries. Every reason changes who owes whom; the reason explains why.
 */
export function TransferSheet({ defaultFrom, onSaved, onError }: { defaultFrom: Person; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const t = useT();
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState<TransferReason>("my_half_of_costs");
  const [from, setFrom] = useState<Person>(defaultFrom);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const to: Person = from === "mike" ? "sai" : "mike";
  const amount = round2(Number(amountText.replace(/[,\s฿]/g, "")) || 0);

  async function save() {
    if (!(amount > 0)) return setError(t("quick.amountRequired"));
    if (reason === "other" && !note.trim()) return setError(t("transfer.otherNeedsNote"));
    setError(null);
    setBusy(true);
    const result = await quickAddTransfer({ date, from_person: from, to_person: to, amount, reason, note: note.trim() || undefined });
    setBusy(false);
    if (!result.ok) return onError(t("quick.failed"));
    onSaved(t("transfer.saved", { from: t(`common.${from}`), to: t(`common.${to}`), amount: thb(amount) }));
  }

  return (
    <form
      className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label={t("common.date")} htmlFor="ts-date" hint={t("transfer.dateHint")}>
        <Input id="ts-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>

      <div className="mt-4">
        <p className="eyebrow mb-1.5">{t("transfer.reason")}</p>
        <div role="radiogroup" aria-label={t("transfer.reason")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TRANSFER_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                "min-h-12 rounded-2xl border px-4 py-2 text-left text-sm font-medium leading-snug break-normal [overflow-wrap:normal] transition-colors",
                reason === r ? "border-berry bg-berry text-ivory" : "border-line bg-card text-plum hover:bg-lavender-tint",
              )}
            >
              {t(`transfer.reason.${r}`)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-plum-soft">{t("transfer.reasonsHint")}</p>
      </div>

      <div className="mt-4">
        <Field label={t("transfer.from")} hint={t("transfer.fromHint", { to: t(`common.${to}`) })}>
          <Chips label={t("transfer.from")} options={PEOPLE.map((p) => ({ value: p, label: t(`common.${p}`) }))} value={from} onChange={setFrom} size="lg" />
        </Field>
      </div>

      <div className="mt-4">
        <Field label={t("common.amount")} htmlFor="ts-amount" hint={t("transfer.amountHint")}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-display text-2xl text-plum-faint">฿</span>
            <input
              id="ts-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="0.00"
              className="w-full min-h-16 rounded-2xl border border-line bg-card pl-11 pr-4 font-display text-3xl tabular text-plum placeholder:text-plum-faint focus:border-berry focus:outline-none focus:ring-2 focus:ring-lavender"
            />
          </div>
        </Field>
      </div>

      <div className="mt-4">
        <Field label={t("common.note")} htmlFor="ts-note" hint={reason === "other" ? t("transfer.otherNeedsNote") : t("transfer.noteHint")}>
          <Textarea id="ts-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" required={reason === "other"} />
        </Field>
      </div>

      {error ? <p className="mt-3 rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{error}</p> : null}
      <div className="mt-5">
        <Button type="submit" disabled={busy} className="min-h-12 w-full text-base">
          {t("transfer.record")}
        </Button>
      </div>
    </form>
  );
}
