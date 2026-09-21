"use client";

import { createPayout } from "@/app/(app)/payouts/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import { platformName } from "@/lib/labels";
import { todayIso } from "@/lib/money";
import { PEOPLE, PLATFORMS, type Person } from "@/lib/types";

/**
 * Payout received: money from a platform reached a bank account. Saving opens
 * the page that matches the payout to the orders it paid.
 */
export function PayoutSheet({ defaultPerson }: { defaultPerson: Person }) {
  const t = useT();
  return (
    <form action={createPayout} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      <div className="mt-2">
        <Field label={t("payouts.amountReceived")} htmlFor="po-amount" hint={t("payout.sheetAmountHint")}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-display text-2xl text-plum-faint">฿</span>
            <input id="po-amount" name="amount_received" type="number" inputMode="decimal" step="0.01" min="0.01" required placeholder="0.00" className="w-full min-h-16 rounded-2xl border border-line bg-card pl-11 pr-4 font-display text-3xl tabular text-plum placeholder:text-plum-faint focus:border-berry focus:outline-none focus:ring-2 focus:ring-lavender" />
          </div>
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label={t("common.platform")} htmlFor="po-platform">
          <Select id="po-platform" name="platform" defaultValue="tiktok">
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {platformName(t, p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("payouts.receivedBy")} htmlFor="po-person">
          <Select id="po-person" name="received_by" defaultValue={defaultPerson}>
            {PEOPLE.map((p) => (
              <option key={p} value={p}>
                {t(`common.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("common.date")} htmlFor="po-date">
          <Input id="po-date" name="date" type="date" required defaultValue={todayIso()} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label={t("common.note")} htmlFor="po-note">
          <Textarea id="po-note" name="note" className="min-h-16" placeholder={t("common.optional")} />
        </Field>
      </div>
      <div className="mt-5">
        <Button type="submit" className="min-h-12 w-full text-base">
          {t("payout.sheetSave")}
        </Button>
      </div>
    </form>
  );
}
