import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { getLocale, t } from "@/lib/i18n/server";
import { createTransaction } from "../actions";

export default async function NewTransactionPage({ searchParams }: PageProps<"/transactions/new">) {
  const params = await searchParams;
  const type = params.type === "expense" ? "expense" : "income";
  const error = typeof params.error === "string" ? params.error : null;
  const tr = t(await getLocale());

  return (
    <div className="max-w-2xl">
      <PageHeader title={type === "income" ? tr("transactions.newIncome") : tr("transactions.newExpense")} />
      <Card className="p-6">
        <TransactionForm tr={tr} type={type} action={createTransaction} error={error} />
      </Card>
    </div>
  );
}
