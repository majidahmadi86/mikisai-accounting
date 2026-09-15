import type { Translator } from "@/lib/i18n/dictionary";
import type { PillTone } from "@/components/ui/Pill";
import type { ExpenseCategory, Person, Platform, ProductLine, SettlementStatus } from "@/lib/types";

export function platformName(tr: Translator, p: Platform): string {
  return tr(`platform.${p}`);
}

export function productName(tr: Translator, p: ProductLine): string {
  return tr(`product.${p}`);
}

export function categoryName(tr: Translator, c: ExpenseCategory): string {
  return tr(`category.${c}`);
}

export function statusName(tr: Translator, s: SettlementStatus): string {
  return tr(`status.${s}`);
}

export function personName(tr: Translator, p: Person): string {
  return tr(`common.${p}`);
}

/** pending = lavender (waiting), settled = warning (in the platform wallet), received = success (in the bank). */
export function statusTone(s: SettlementStatus): PillTone {
  if (s === "received_in_bank") return "success";
  if (s === "settled_not_withdrawn") return "warning";
  return "lavender";
}

export function platformTone(p: Platform): PillTone {
  if (p === "tiktok") return "plum";
  if (p === "shopee") return "berry-soft";
  if (p === "fb") return "lavender";
  return "neutral";
}

export function typeTone(type: "income" | "expense"): PillTone {
  return type === "income" ? "berry" : "berry-soft";
}
