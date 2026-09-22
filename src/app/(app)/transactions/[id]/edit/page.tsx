import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { SoftDeleteButton } from "@/components/ui/SoftDeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { selectableCategories } from "@/lib/categories";
import { valueStock } from "@/lib/inventory/valuation";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDateTime, thb } from "@/lib/money";
import { num, type AuditLog, type SettlementStatus, type Transaction } from "@/lib/types";
import { updateTransaction } from "../../actions";

function describeValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "·";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : thb(v);
  return String(v);
}

export default async function EditTransactionPage({ params, searchParams }: PageProps<"/transactions/[id]/edit">) {
  const [{ id }, sp, session, locale] = await Promise.all([params, searchParams, requireSession(), getLocale()]);
  const { supabase } = session;
  const admin = session.profile.role === "admin";
  const tr = t(locale);

  const [{ data }, { data: auditRows }, { data: profiles }, snapshot] = await Promise.all([
    supabase.from("transactions").select("*, settlements(status)").eq("id", id).is("deleted_at", null).maybeSingle(),
    admin ? supabase.from("audit_log").select("*").eq("entity_type", "transaction").eq("entity_id", id).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] as AuditLog[] }),
    supabase.from("profiles").select("id, display_name"),
    getLedgerSnapshot(session.profile.business_id),
  ]);
  if (!data) notFound();

  const settlementRaw = Array.isArray(data.settlements) ? data.settlements[0] : data.settlements;
  const settlementStatus: SettlementStatus | null = settlementRaw?.status ?? null;
  const tx: Transaction = { ...data, gross_amount: num(data.gross_amount), net_amount: num(data.net_amount), quantity: num(data.quantity) || 1 };

  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string]));
  const who = (id: string | null) => (id ? (nameOf.get(id) ?? "?") : "·");
  const history = (auditRows ?? []) as AuditLog[];
  const created = history.find((h) => h.action === "create");
  const lastEdit = history.find((h) => h.action === "update");

  const update = updateTransaction.bind(null, id);
  // Two rows with the same amount on the same day: deleting one must never take the other.
  const twin = snapshot.transactions.some((t) => t.id !== id && t.type === tx.type && t.date === tx.date && Math.abs(t.net_amount - tx.net_amount) < 0.005);

  return (
    <div className="max-w-2xl">
      <PageHeader
        eyebrow={tx.type === "income" ? tr("common.income") : tr("common.expense")}
        title={tr("transactions.editTitle")}
        subtitle={tr("transactions.editSubtitle")}
        action={admin ? <SoftDeleteButton entity="transaction" id={id} afterHref="/transactions" confirmOnly={twin} /> : null}
      />
      <Card className="p-5 sm:p-6">
        <TransactionForm
          tr={tr}
          type={tx.type}
          action={update}
          admin={admin}
          initial={tx}
          settlementStatus={tx.type === "income" ? settlementStatus : undefined}
          error={typeof sp.error === "string" ? sp.error : null}
          categories={selectableCategories(snapshot.categories, tx.category_id)}
          products={snapshot.products.filter((p) => p.active || snapshot.items.some((i) => i.transaction_id === id && i.product_id === p.id))}
          initialItems={snapshot.items.filter((i) => i.transaction_id === id).map((i) => ({ product_id: i.product_id, qty: i.qty, unit_price: i.unit_price, unit_cost: i.unit_cost ?? undefined }))}
          avgCost={Object.fromEntries(valueStock(snapshot.products, snapshot.movements).products.map((r) => [r.product.id, r.avgCost]))}
        />
      </Card>

      {admin ? (
      <Card className="mt-4">
        <CardHeader title={tr("transactions.history")} />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <p className="text-sm text-plum-soft">
            {lastEdit
              ? tr("transactions.editedBy", { name: who(lastEdit.actor_user_id), when: formatDateTime(lastEdit.created_at, locale) })
              : created
                ? tr("transactions.addedBy", { name: who(created.actor_user_id), when: formatDateTime(created.created_at, locale) })
                : tr("transactions.noHistory")}
          </p>
          {history.length ? (
            <ul className="mt-3 divide-y divide-line">
              {history.map((h) => (
                <li key={h.id} className="py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={h.action === "delete" ? "berry-soft" : h.action === "update" ? "lavender" : "success"}>{h.action}</Pill>
                    <span className="text-plum">{who(h.actor_user_id)}</span>
                    <span className="text-xs text-plum-faint">{formatDateTime(h.created_at, locale)}</span>
                  </div>
                  {h.action === "update" && h.after ? (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-plum-soft">
                      {Object.keys(h.after).map((k) => (
                        <li key={k} className="tabular">
                          <span className="text-plum-faint">{k}</span> {describeValue(h.before?.[k])} → <span className="text-plum">{describeValue(h.after?.[k])}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
      ) : null}
    </div>
  );
}
