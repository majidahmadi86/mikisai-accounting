"use client";

import { useState } from "react";
import { Chips } from "@/components/ui/Chips";
import { useLocale, useT } from "@/lib/i18n/client";
import { categoryLabel, type ExpenseCategory } from "@/lib/categories";
import type { Product } from "@/lib/inventory/valuation";
import { ItemsEditor, type ItemDraft } from "./ItemsEditor";

/** Expense category as one-tap chips (they wrap to two rows on a phone) with a hidden category_id input. */
export function CategoryChips({ categories, defaultValue, name = "category_id", products = [], initialItems = [] }: { categories: ExpenseCategory[]; defaultValue?: string | null; name?: string; products?: Product[]; initialItems?: ItemDraft[] }) {
  const t = useT();
  const locale = useLocale();
  const [value, setValue] = useState<string | null>(defaultValue ?? categories[0]?.id ?? null);
  const effect = categories.find((c) => c.id === value)?.stock_effect ?? "none";
  return (
    <div className="space-y-3">
      <Chips name={name} label={t("common.category")} value={value} onChange={setValue} options={categories.map((c) => ({ value: c.id, label: categoryLabel(c, locale) }))} />
      {effect !== "none" && products.length ? <ItemsEditor products={products} initial={initialItems} mode="purchase" /> : null}
    </div>
  );
}
