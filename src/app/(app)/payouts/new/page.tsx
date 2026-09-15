import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName } from "@/lib/labels";
import { todayIso } from "@/lib/money";
import { PEOPLE, PLATFORMS } from "@/lib/types";
import { createPayout } from "../actions";

export default async function NewPayoutPage({ searchParams }: PageProps<"/payouts/new">) {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const tr = t(locale);

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("payouts.newTitle")} subtitle={tr("payouts.subtitle")} />
      <Card className="p-6">
        <form action={createPayout} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr("common.date")} htmlFor="date">
              <Input id="date" name="date" type="date" required defaultValue={todayIso()} />
            </Field>
            <Field label={tr("common.platform")} htmlFor="platform">
              <Select id="platform" name="platform" defaultValue="tiktok">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {platformName(tr, p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr("payouts.amountReceived")} htmlFor="amount_received">
              <Input id="amount_received" name="amount_received" type="number" step="0.01" min="0.01" required />
            </Field>
            <Field label={tr("payouts.receivedBy")} htmlFor="received_by">
              <Select id="received_by" name="received_by" defaultValue="mike">
                {PEOPLE.map((p) => (
                  <option key={p} value={p}>
                    {tr(`common.${p}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={tr("common.note")} htmlFor="note">
            <Textarea id="note" name="note" className="min-h-16" />
          </Field>
          {sp.error ? <p className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{tr("common.error")}</p> : null}
          <div className="flex gap-2">
            <Button type="submit">{tr("payouts.reconcile")} →</Button>
            <ButtonLink href="/payouts" variant="ghost">
              {tr("common.cancel")}
            </ButtonLink>
          </div>
        </form>
      </Card>
    </div>
  );
}
