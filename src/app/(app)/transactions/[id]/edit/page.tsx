import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { num, type SettlementStatus, type Transaction } from "@/lib/types";
import { deleteTransaction, updateTransaction } from "../../actions";

export default async function EditTransactionPage({ params, searchParams }: PageProps<"/transactions/[id]/edit">) {
  const [{ id }, sp, { supabase }, locale] = await Promise.all([params, searchParams, requireSession(), getLocale()]);
  const tr = t(locale);

  const { data } = await supabase.from("transactions").select("*, settlements(status)").eq("id", id).maybeSingle();
  if (!data) notFound();

  const settlementRaw = Array.isArray(data.settlements) ? data.settlements[0] : data.settlements;
  const settlementStatus: SettlementStatus | null = settlementRaw?.status ?? null;
  const tx: Transaction = { ...data, gross_amount: num(data.gross_amount), net_amount: num(data.net_amount) };

  const update = updateTransaction.bind(null, id);
  const remove = deleteTransaction.bind(null, id);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={tr("transactions.editTitle")}
        action={
          <form action={remove}>
            <DeleteButton />
          </form>
        }
      />
      <Card className="p-6">
        <TransactionForm
          tr={tr}
          type={tx.type}
          action={update}
          initial={tx}
          settlementStatus={tx.type === "income" ? settlementStatus : undefined}
          error={typeof sp.error === "string" ? sp.error : null}
        />
      </Card>
    </div>
  );
}
