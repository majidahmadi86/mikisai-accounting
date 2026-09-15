import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName } from "@/lib/labels";
import { todayIso } from "@/lib/money";
import { PEOPLE, PLATFORMS } from "@/lib/types";
import { createPayout } from "../actions";

export default async function NewPayoutPage({ searchParams }: PageProps<"/payouts/new">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const me = session.profile.display_name === "Sai" ? "sai" : "mike";

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("payouts.newTitle")} subtitle={tr("payouts.newSubtitle")} />
      <Card className="p-5 sm:p-6">
        <form action={createPayout} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr("payouts.amountReceived")} htmlFor="amount_received" hint={tr("payouts.amountHint")}>
              <Input id="amount_received" name="amount_received" type="number" inputMode="decimal" step="0.01" min="0.01" required autoFocus className="tabular text-lg" />
            </Field>
            <Field label={tr("common.platform")} htmlFor="platform" hint={tr("payouts.platformHint")}>
              <Select id="platform" name="platform" defaultValue="tiktok">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {platformName(tr, p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr("common.date")} htmlFor="date" hint={tr("payouts.dateHint")}>
              <Input id="date" name="date" type="date" required defaultValue={todayIso()} />
            </Field>
            <Field label={tr("payouts.receivedBy")} htmlFor="received_by" hint={tr("payouts.receivedByHint")}>
              <Select id="received_by" name="received_by" defaultValue={me}>
                {PEOPLE.map((p) => (
                  <option key={p} value={p}>
                    {tr(`common.${p}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={tr("common.note")} htmlFor="note" hint={tr("payouts.noteHint")}>
            <Textarea id="note" name="note" className="min-h-16" />
          </Field>
          {sp.error ? <p className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{tr("common.error")}</p> : null}
          <div className="sticky bottom-20 z-10 -mx-5 flex gap-2 border-t border-line bg-ivory/95 px-5 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <Button type="submit" className="flex-1 md:flex-none">
              {tr("payouts.reconcile")} →
            </Button>
            <ButtonLink href="/payouts" variant="ghost">
              {tr("common.cancel")}
            </ButtonLink>
          </div>
        </form>
      </Card>
    </div>
  );
}
