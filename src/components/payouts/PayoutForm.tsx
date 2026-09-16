import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { Translator } from "@/lib/i18n/dictionary";
import { platformName } from "@/lib/labels";
import { todayIso } from "@/lib/money";
import { PEOPLE, PLATFORMS, type Payout, type Person } from "@/lib/types";

/** Shared by New payout and Edit payout. Date comes first, then the rest in the same order. */
export function PayoutForm({
  tr,
  action,
  initial,
  defaultPerson,
  error,
  submitLabel,
}: {
  tr: Translator;
  action: (formData: FormData) => void | Promise<void>;
  initial?: Partial<Payout>;
  defaultPerson: Person;
  error?: string | null;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("common.date")} htmlFor="date" hint={tr("payouts.dateHint")}>
          <Input id="date" name="date" type="date" required defaultValue={initial?.date ?? todayIso()} />
        </Field>
        <Field label={tr("payouts.amountReceived")} htmlFor="amount_received" hint={tr("payouts.amountHint")}>
          <Input id="amount_received" name="amount_received" type="number" inputMode="decimal" step="0.01" min="0.01" required defaultValue={initial?.amount_received ?? ""} className="tabular text-lg" />
        </Field>
        <Field label={tr("common.platform")} htmlFor="platform" hint={tr("payouts.platformHint")}>
          <Select id="platform" name="platform" defaultValue={initial?.platform ?? "tiktok"}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {platformName(tr, p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("payouts.receivedBy")} htmlFor="received_by" hint={tr("payouts.receivedByHint")}>
          <Select id="received_by" name="received_by" defaultValue={initial?.received_by ?? defaultPerson}>
            {PEOPLE.map((p) => (
              <option key={p} value={p}>
                {tr(`common.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={tr("common.note")} htmlFor="note" hint={tr("payouts.noteHint")}>
        <Textarea id="note" name="note" className="min-h-16" defaultValue={initial?.note ?? ""} />
      </Field>
      {error ? <p className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{error === "denied" ? tr("roles.denied") : tr("common.error")}</p> : null}
      <div className="sticky bottom-20 z-10 -mx-5 flex gap-2 border-t border-line bg-ivory/95 px-5 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" className="flex-1 md:flex-none">
          {submitLabel}
        </Button>
        <ButtonLink href="/payouts" variant="ghost">
          {tr("common.cancel")}
        </ButtonLink>
      </div>
    </form>
  );
}
