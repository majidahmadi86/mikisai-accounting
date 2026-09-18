import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { Translator } from "@/lib/i18n/dictionary";
import { platformName, productName, statusName } from "@/lib/labels";
import type { ExpenseCategory } from "@/lib/categories";
import type { ItemDraft } from "./ItemsEditor";
import { ExpenseMoneyAndItems, IncomeMoneyAndItems } from "./MoneyAndItems";
import type { Product } from "@/lib/inventory/valuation";
import { todayIso } from "@/lib/money";
import {
  PEOPLE,
  PLATFORMS,
  PRODUCT_LINES,
  SETTLEMENT_STATUSES,
  type Person,
  type SettlementStatus,
  type Transaction,
  type TransactionType,
} from "@/lib/types";

/** Full edit form. Quick entry lives in components/quick-entry; this one is for editing and for the fallback /transactions/new page. */
export function TransactionForm({
  tr,
  type,
  action,
  initial,
  settlementStatus,
  error,
  defaultPerson = "mike",
  categories = [],
  products = [],
  initialItems = [],
  avgCost = {},
  admin = false,
}: {
  tr: Translator;
  type: TransactionType;
  action: (formData: FormData) => void | Promise<void>;
  initial?: Partial<Transaction>;
  settlementStatus?: SettlementStatus | null;
  error?: string | null;
  defaultPerson?: Person;
  categories?: ExpenseCategory[];
  products?: Product[];
  initialItems?: ItemDraft[];
  avgCost?: Record<string, number>;
  admin?: boolean;
}) {
  const isIncome = type === "income";
  const duplicate = error?.startsWith("duplicate:") ? error.split(":") : null;
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="type" value={type} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("common.date")} htmlFor="date" hint={tr("transactions.dateHint")}>
          <Input id="date" name="date" type="date" required defaultValue={initial?.date ?? todayIso()} />
        </Field>
        {isIncome ? (
          <IncomeMoneyAndItems initialGross={initial?.gross_amount != null ? String(initial.gross_amount) : ""} initialNet={initial?.net_amount != null ? String(initial.net_amount) : ""} products={products} initialItems={initialItems} avgCost={avgCost} />
        ) : (
          <ExpenseMoneyAndItems initialAmount={initial?.net_amount != null ? String(initial.net_amount) : ""} categories={categories} initialCategory={initial?.category_id ?? null} products={products} initialItems={initialItems} />
        )}
        <Field label={isIncome ? tr("transactions.receivedBy") : tr("transactions.paidBy")} htmlFor="person" hint={isIncome ? tr("transactions.personIncomeHint") : tr("transactions.personExpenseHint")}>
          <Select id="person" name={isIncome ? "received_by" : "payer"} defaultValue={(isIncome ? initial?.received_by : initial?.payer) ?? defaultPerson} required>
            {PEOPLE.map((p) => (
              <option key={p} value={p}>
                {tr(`common.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("common.platform")} htmlFor="platform" hint={tr("transactions.platformHint")}>
          <Select id="platform" name="platform" defaultValue={initial?.platform ?? (isIncome ? "tiktok" : "other")}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {platformName(tr, p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("common.product")} htmlFor="product_line" hint={tr("transactions.productHint")}>
          <Select id="product_line" name="product_line" defaultValue={initial?.product_line ?? "sugar"}>
            {PRODUCT_LINES.map((p) => (
              <option key={p} value={p}>
                {productName(tr, p)}
              </option>
            ))}
          </Select>
        </Field>
        {isIncome ? (
          <Field label={tr("transactions.customerName")} htmlFor="customer_name" hint={tr("transactions.customerHint")}>
            <Input id="customer_name" name="customer_name" defaultValue={initial?.customer_name ?? ""} placeholder={tr("common.optional")} />
          </Field>
        ) : null}
        {isIncome ? (
          <Field label={tr("transactions.orderRef")} htmlFor="order_ref" hint={tr("transactions.orderRefHint")}>
            <Input id="order_ref" name="order_ref" inputMode="numeric" autoComplete="off" defaultValue={initial?.order_ref ?? ""} placeholder={tr("common.optional")} className="font-mono" />
          </Field>
        ) : null}
        {isIncome && settlementStatus !== undefined ? (
          <Field label={tr("transactions.settlement")} htmlFor="settlement_status" hint={tr("transactions.settlementHint")}>
            <Select id="settlement_status" name="settlement_status" defaultValue={settlementStatus ?? "pending"}>
              {SETTLEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusName(tr, s)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <Field label={tr("common.note")} htmlFor="note" hint={tr("transactions.noteHint")}>
        <Textarea id="note" name="note" defaultValue={initial?.note ?? ""} />
      </Field>
      {duplicate ? (
        <div className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">
          <p>{tr("transactions.duplicate", { date: duplicate[1] || "?", amount: `฿${Number(duplicate[2] ?? 0).toFixed(2)}` })}</p>
          {admin ? (
            <label className="mt-2 block text-xs text-plum">
              {tr("transactions.duplicateOverride")}
              <Input name="override_reason" required maxLength={300} className="mt-1" />
            </label>
          ) : (
            <p className="mt-1 text-xs">{tr("transactions.duplicateBlocked")}</p>
          )}
        </div>
      ) : error ? (
        <p className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">
          {error === "denied" ? tr("roles.denied") : error === "items" ? tr("inventory.itemsRequired") : error.startsWith("reconcile") ? tr("inventory.reconcileBlocked", { diff: `฿${Math.abs(Number(error.split(":")[1] ?? 0)).toFixed(2)}` }) : error === "unspecified" ? tr("inventory.unspecifiedBlocked") : tr("common.error")}
        </p>
      ) : null}
      <div className="sticky bottom-20 z-10 -mx-5 flex gap-2 border-t border-line bg-ivory/95 px-5 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" className="flex-1 md:flex-none">
          {tr("common.save")}
        </Button>
        <ButtonLink href="/transactions" variant="ghost">
          {tr("common.cancel")}
        </ButtonLink>
      </div>
    </form>
  );
}
