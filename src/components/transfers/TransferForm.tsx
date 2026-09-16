import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { KindChips } from "./KindChips";
import type { Translator } from "@/lib/i18n/dictionary";
import { todayIso } from "@/lib/money";
import { PEOPLE, type InternalTransfer } from "@/lib/types";

/** Shared by the dashboard "Record a transfer" box and Edit transfer. Date first. */
export function TransferForm({
  tr,
  action,
  initial,
  error,
  submitLabel,
  redirectTo = "/",
  cancelHref,
  compact = false,
}: {
  tr: Translator;
  action: (formData: FormData) => void | Promise<void>;
  initial?: Partial<InternalTransfer>;
  error?: string | null;
  submitLabel: string;
  redirectTo?: "/" | "/balance";
  cancelHref?: string;
  compact?: boolean;
}) {
  const idp = compact ? "t" : "tf";
  return (
    <form action={action} className={compact ? "space-y-3 px-4 pb-4" : "space-y-5"}>
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <Field label={tr("common.date")} htmlFor={`${idp}-date`} hint={tr("transfer.dateHint")}>
        <Input id={`${idp}-date`} name="date" type="date" required defaultValue={initial?.date ?? todayIso()} />
      </Field>
      <Field label={tr("transfer.kind")} hint={tr("transfer.kindHint")}>
        <KindChips defaultValue={initial?.kind ?? "settlement"} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr("transfer.from")} htmlFor={`${idp}-from`}>
          <Select id={`${idp}-from`} name="from_person" defaultValue={initial?.from_person ?? "mike"}>
            {PEOPLE.map((p) => (
              <option key={p} value={p}>
                {tr(`common.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("transfer.to")} htmlFor={`${idp}-to`}>
          <Select id={`${idp}-to`} name="to_person" defaultValue={initial?.to_person ?? "sai"}>
            {PEOPLE.map((p) => (
              <option key={p} value={p}>
                {tr(`common.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={tr("common.amount")} htmlFor={`${idp}-amount`} hint={tr("transfer.amountHint")}>
        <Input id={`${idp}-amount`} name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required defaultValue={initial?.amount ?? ""} className="tabular text-lg" />
      </Field>
      <Field label={tr("common.note")} htmlFor={`${idp}-note`} hint={tr("dashboard.transferHint")}>
        <Textarea id={`${idp}-note`} name="note" className="min-h-16" defaultValue={initial?.note ?? ""} />
      </Field>
      {error ? <p className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{error === "denied" ? tr("roles.denied") : tr("common.error")}</p> : null}
      <div className={compact ? "flex justify-end" : "sticky bottom-20 z-10 -mx-5 flex gap-2 border-t border-line bg-ivory/95 px-5 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0"}>
        <Button type="submit" variant={compact ? "secondary" : "primary"} className={compact ? "" : "flex-1 md:flex-none"}>
          {submitLabel}
        </Button>
        {cancelHref ? (
          <ButtonLink href={cancelHref} variant="ghost">
            {tr("common.cancel")}
          </ButtonLink>
        ) : null}
      </div>
    </form>
  );
}
