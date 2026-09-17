"use client";

import { useState } from "react";
import { Chips } from "@/components/ui/Chips";
import { Field, Input } from "@/components/ui/Field";
import { useLocale, useT } from "@/lib/i18n/client";
import { categoryLabel, type ExpenseCategory } from "@/lib/categories";
import type { Product } from "@/lib/inventory/valuation";
import { derivedUnitPrice, reconcileLines } from "@/lib/ledger/reconcile";
import { round2, thb } from "@/lib/money";
import { ItemsEditor, type ItemChange, type ItemDraft } from "./ItemsEditor";
import { cn } from "@/lib/cn";

function num(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Keeps the money on the form and its product lines in step. One line: a
 * quantity change keeps the line equal to the amount and recomputes the unit
 * price; a unit price change recomputes the amount; an amount change
 * recomputes the unit price. Several lines: line edits recompute the amount.
 */
function useLinked(initialAmount: string, initialItems: ItemDraft[], products: Product[], priceKey: "unit_price" | "unit_cost", active: boolean) {
  const [amount, setAmount] = useState(initialAmount);
  const [rows, setRows] = useState<ItemDraft[]>(() => (initialItems.length ? initialItems : [{ product_id: products[0]?.id ?? "", qty: 1, unit_price: products[0]?.default_price ?? 0, unit_cost: products[0]?.default_cost ?? 0 }]));
  const total = num(amount);
  const linesSum = round2(rows.reduce((a, r) => a + r.qty * (r[priceKey] ?? 0), 0));

  function onAmount(text: string) {
    setAmount(text);
    if (active && rows.length === 1) setRows([{ ...rows[0], [priceKey]: derivedUnitPrice(num(text), rows[0].qty) }]);
  }
  function onItems(next: ItemDraft[], change: ItemChange) {
    if (!active) return setRows(next);
    if (next.length === 1 && (change.field === "qty" || change.field === "product" || change.field === "remove")) {
      // Single line follows the amount.
      const r = next[0];
      setRows([{ ...r, [priceKey]: derivedUnitPrice(total, r.qty) }]);
      return;
    }
    setRows(next);
    if (change.field === "price" || (next.length > 1 && change.field !== "product")) setAmount(String(round2(next.reduce((a, r) => a + r.qty * (r[priceKey] ?? 0), 0))));
  }
  const check = active ? reconcileLines(rows.map((r) => ({ qty: r.qty, price: r[priceKey] ?? 0 })), total) : null;
  return { amount, rows, linesSum, onAmount, onItems, check };
}

function ReconcileLine({ sum, total, ok, difference }: { sum: number; total: number; ok: boolean; difference: number }) {
  const t = useT();
  return (
    <p className={cn("mt-2 text-xs", ok ? "text-plum-faint" : "font-medium text-berry")}>
      {t("inventory.linesTotal", { sum: thb(sum), total: thb(total) })}
      {ok ? "" : ` · ${t("inventory.reconcileOff", { diff: thb(Math.abs(difference)) })}`}
    </p>
  );
}

export function IncomeMoneyAndItems({ initialGross, initialNet, products, initialItems, avgCost }: { initialGross: string; initialNet: string; products: Product[]; initialItems: ItemDraft[]; avgCost: Record<string, number> }) {
  const t = useT();
  const linked = useLinked(initialGross, initialItems, products, "unit_price", true);
  return (
    <>
      <Field label={t("common.gross")} htmlFor="gross_amount" hint={t("transactions.grossHint")}>
        <Input id="gross_amount" name="gross_amount" type="number" inputMode="decimal" step="0.01" min="0" required value={linked.amount} onChange={(e) => linked.onAmount(e.target.value)} className="tabular text-lg" />
      </Field>
      <Field label={t("common.net")} htmlFor="net_amount" hint={t("transactions.netHint")}>
        <Input id="net_amount" name="net_amount" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={initialNet} className="tabular text-lg" />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("inventory.items")} hint={t("inventory.itemsHintSale")}>
          <input type="hidden" name="items" value={JSON.stringify(linked.rows)} />
          <ItemsEditor products={products} rows={linked.rows} onChange={linked.onItems} mode="sale" avgCost={avgCost} />
          {linked.check ? <ReconcileLine {...linked.check} /> : null}
        </Field>
      </div>
    </>
  );
}

export function ExpenseMoneyAndItems({ initialAmount, categories, initialCategory, products, initialItems }: { initialAmount: string; categories: ExpenseCategory[]; initialCategory: string | null; products: Product[]; initialItems: ItemDraft[] }) {
  const t = useT();
  const locale = useLocale();
  const [category, setCategory] = useState<string | null>(initialCategory ?? categories[0]?.id ?? null);
  const effect = categories.find((c) => c.id === category)?.stock_effect ?? "none";
  const linked = useLinked(initialAmount, initialItems, products, "unit_cost", effect === "purchase");
  return (
    <>
      <Field label={t("common.amount")} htmlFor="amount" hint={t("transactions.amountHint")}>
        <Input id="amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0" required value={linked.amount} onChange={(e) => linked.onAmount(e.target.value)} className="tabular text-lg" />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("common.category")} hint={t("transactions.categoryHint")}>
          <div className="space-y-3">
            <Chips name="category_id" label={t("common.category")} value={category} onChange={setCategory} options={categories.map((c) => ({ value: c.id, label: categoryLabel(c, locale) }))} />
            {effect !== "none" && products.length ? (
              <>
                <input type="hidden" name="items" value={JSON.stringify(linked.rows)} />
                <ItemsEditor products={products} rows={linked.rows} onChange={linked.onItems} mode="purchase" />
                {linked.check ? <ReconcileLine {...linked.check} /> : null}
              </>
            ) : null}
          </div>
        </Field>
      </div>
    </>
  );
}
