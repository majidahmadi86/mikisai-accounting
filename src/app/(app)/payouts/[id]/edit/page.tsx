import { notFound } from "next/navigation";
import { PayoutForm } from "@/components/payouts/PayoutForm";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SoftDeleteButton } from "@/components/ui/SoftDeleteButton";
import { personOf, requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { UUID } from "@/lib/soft-delete";
import { num, type Payout } from "@/lib/types";
import { updatePayout } from "../../actions";

export default async function EditPayoutPage({ params, searchParams }: PageProps<"/payouts/[id]/edit">) {
  const [{ id }, sp, session, locale] = await Promise.all([params, searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  if (!UUID.test(id)) notFound();
  const { data } = await session.supabase.from("payouts").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const payout: Payout = { ...(data as Payout), amount_received: num(data.amount_received) };
  const admin = session.profile.role === "admin";

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow={tr("payouts.title")} title={tr("payouts.editTitle")} subtitle={tr("transactions.editSubtitle")} action={admin ? <SoftDeleteButton entity="payout" id={id} afterHref="/payouts" /> : null} />
      <Card className="p-5 sm:p-6">
        <PayoutForm tr={tr} action={updatePayout.bind(null, id)} initial={payout} defaultPerson={personOf(session)} error={typeof sp.error === "string" ? sp.error : null} submitLabel={tr("common.save")} />
      </Card>
    </div>
  );
}
