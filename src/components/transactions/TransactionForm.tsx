import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { Translator } from "@/lib/i18n/dictionary";
import { categoryName, platformName, productName, statusName } from "@/lib/labels";
import { todayIso } from "@/lib/money";
import {
  EXPENSE_CATEGORIES,
  PEOPLE,
  PLATFORMS,
  PRODUCT_LINES,
  SETTLEMENT_STATUSES,
  type SettlementStatus,
  type Transaction,
  type TransactionType,
} from "@/lib/types";

export function TransactionForm({
  tr,
  type,
  action,
  initial,
  settlementStatus,
  error,
}: {
  tr: Translator;
  type: TransactionType;
  action: (formData: FormData) => void | Promise<void>;
  initial?: Partial<Transaction>;
  settlementStatus?: SettlementStatus | null;
  error?: string | null;
}) {
  const isIncome = type === "income";
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="type" value={type} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("common.date")} htmlFor="date">
          <Input id="date" name="date" type="date" required defaultValue={initial?.date ?? todayIso()} />
        </Field>
        <Field label={isIncome ? tr("transactions.receivedBy") : tr("transactions.paidBy")} htmlFor="person">
          <Select id="person" name={isIncome ? "received_by" : "payer"} defaultValue={(isIncome ? initial?.received_by : initial?.payer) ?? "mike"} required>
            {PEOPLE.map((p) => (
              <option key={p} value={p}>
                {tr(`common.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("common.platform")} htmlFor="platform">
          <Select id="platform" name="platform" defaultValue={initial?.platform ?? (isIncome ? "tiktok" : "other")}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {platformName(tr, p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("common.product")} htmlFor="product_line">
          <Select id="product_line" name="product_line" defaultValue={initial?.product_line ?? "sugar"}>
            {PRODUCT_LINES.map((p) => (
              <option key={p} value={p}>
                {productName(tr, p)}
              </option>
            ))}
          </Select>
        </Field>

        {isIncome ? (
          <>
            <Field label={tr("common.gross")} htmlFor="gross_amount" hint={tr("transactions.grossHint")}>
              <Input id="gross_amount" name="gross_amount" type="number" step="0.01" min="0" required defaultValue={initial?.gross_amount ?? ""} />
            </Field>
            <Field label={tr("common.net")} htmlFor="net_amount" hint={tr("transactions.netHint")}>
              <Input id="net_amount" name="net_amount" type="number" step="0.01" min="0" defaultValue={initial?.net_amount ?? ""} />
            </Field>
            <Field label={tr("transactions.customerName")} htmlFor="customer_name">
              <Input id="customer_name" name="customer_name" defaultValue={initial?.customer_name ?? ""} placeholder={tr("common.optional")} />
            </Field>
            {settlementStatus !== undefined ? (
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
          </>
        ) : (
          <>
            <Field label={tr("common.amount")} htmlFor="amount">
              <Input id="amount" name="amount" type="number" step="0.01" min="0" required defaultValue={initial?.net_amount ?? ""} />
            </Field>
            <Field label={tr("common.category")} htmlFor="category">
              <Select id="category" name="category" defaultValue={initial?.category ?? "product_cost"}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryName(tr, c)}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>
      <Field label={tr("common.note")} htmlFor="note">
        <Textarea id="note" name="note" defaultValue={initial?.note ?? ""} />
      </Field>
      {error ? <p className="rounded-xl bg-clay-tint px-3 py-2 text-sm text-clay">{tr("common.error")}</p> : null}
      <div className="flex gap-2">
        <Button type="submit">{tr("common.save")}</Button>
        <ButtonLink href="/transactions" variant="ghost">
          {tr("common.cancel")}
        </ButtonLink>
      </div>
    </form>
  );
}
