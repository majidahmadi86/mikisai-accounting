"use client";

import { useState } from "react";
import { Chips } from "@/components/ui/Chips";
import { useLocale, useT } from "@/lib/i18n/client";
import { categoryLabel, type ExpenseCategory } from "@/lib/categories";

/** Expense category as one-tap chips (they wrap to two rows on a phone) with a hidden category_id input. */
export function CategoryChips({ categories, defaultValue, name = "category_id" }: { categories: ExpenseCategory[]; defaultValue?: string | null; name?: string }) {
  const t = useT();
  const locale = useLocale();
  const [value, setValue] = useState<string | null>(defaultValue ?? categories[0]?.id ?? null);
  return <Chips name={name} label={t("common.category")} value={value} onChange={setValue} options={categories.map((c) => ({ value: c.id, label: categoryLabel(c, locale) }))} />;
}
