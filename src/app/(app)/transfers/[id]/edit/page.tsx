import { notFound } from "next/navigation";
import { TransferForm } from "@/components/transfers/TransferForm";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SoftDeleteButton } from "@/components/ui/SoftDeleteButton";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { UUID } from "@/lib/soft-delete";
import { num, type InternalTransfer } from "@/lib/types";
import { updateTransfer } from "../../actions";

export default async function EditTransferPage({ params, searchParams }: PageProps<"/transfers/[id]/edit">) {
  const [{ id }, sp, session, locale] = await Promise.all([params, searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  if (!UUID.test(id)) notFound();
  const { data } = await session.supabase.from("internal_transfers").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const transfer: InternalTransfer = { ...(data as InternalTransfer), amount: num(data.amount) };
  const admin = session.profile.role === "admin";

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow={tr("dashboard.transfersTitle")} title={tr("transfer.editTitle")} subtitle={tr("transactions.editSubtitle")} action={admin ? <SoftDeleteButton entity="internal_transfer" id={id} afterHref="/" /> : null} />
      <Card className="p-5 sm:p-6">
        <TransferForm tr={tr} action={updateTransfer.bind(null, id)} initial={transfer} error={typeof sp.error === "string" ? sp.error : null} submitLabel={tr("common.save")} cancelHref="/" />
      </Card>
    </div>
  );
}
