import { PayoutForm } from "@/components/payouts/PayoutForm";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { personOf, requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { createPayout } from "../actions";

export default async function NewPayoutPage({ searchParams }: PageProps<"/payouts/new">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("payouts.newTitle")} subtitle={tr("payouts.newSubtitle")} />
      <Card className="p-5 sm:p-6">
        <PayoutForm tr={tr} action={createPayout} defaultPerson={personOf(session)} error={typeof sp.error === "string" ? sp.error : null} submitLabel={`${tr("payouts.reconcile")} →`} />
      </Card>
    </div>
  );
}
