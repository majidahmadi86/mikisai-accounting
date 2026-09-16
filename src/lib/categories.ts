import type { Locale } from "@/lib/i18n/dictionary";

/** An expense category row as stored in expense_categories. */
export const STOCK_EFFECTS = ["none", "purchase", "sample"] as const;
export type StockEffect = (typeof STOCK_EFFECTS)[number];

export type ExpenseCategory = {
  id: string;
  business_id?: string;
  name_en: string;
  name_th: string;
  sort: number;
  active: boolean;
  /** Whether an expense in this category moves stock: purchases bring units in, samples take them out. */
  stock_effect: StockEffect;
};

export function categoryLabel(cat: Pick<ExpenseCategory, "name_en" | "name_th"> | null | undefined, locale: Locale): string {
  if (!cat) return "";
  return locale === "th" ? cat.name_th || cat.name_en : cat.name_en;
}

/** Active categories in display order, plus the one currently on the row (even if deactivated) so an edit can keep it. */
export function selectableCategories(all: ExpenseCategory[], currentId?: string | null): ExpenseCategory[] {
  const sorted = [...all].sort((a, b) => a.sort - b.sort || a.name_en.localeCompare(b.name_en));
  return sorted.filter((c) => c.active || c.id === currentId);
}

export function categoryById(all: ExpenseCategory[]): Map<string, ExpenseCategory> {
  return new Map(all.map((c) => [c.id, c]));
}
