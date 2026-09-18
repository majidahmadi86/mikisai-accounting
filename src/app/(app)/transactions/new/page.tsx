import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { selectableCategories } from "@/lib/categories";
import { valueStock } from "@/lib/inventory/valuation";
import { getLocale, t } from "@/lib/i18n/server";
import { createTransaction } from "../actions";

export default async function NewTransactionPage({ searchParams }: PageProps<"/transactions/new">) {
  const [params, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const type = params.type === "expense" ? "expense" : "income";
  const error = typeof params.error === "string" ? params.error : null;
  const tr = t(locale);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);

  return (
    <div className="max-w-2xl">
      <PageHeader title={type === "income" ? tr("transactions.newIncome") : tr("transactions.newExpense")} subtitle={tr("quick.subtitle")} />
      <Card className="p-5 sm:p-6">
        <TransactionForm tr={tr} type={type} action={createTransaction} error={error} admin={session.profile.role === "admin"} defaultPerson={session.profile.display_name === "Sai" ? "sai" : "mike"} categories={selectableCategories(snapshot.categories)} products={snapshot.products.filter((p) => p.active)} avgCost={Object.fromEntries(valueStock(snapshot.products, snapshot.movements).products.map((r) => [r.product.id, r.avgCost]))} />
      </Card>
    </div>
  );
}
