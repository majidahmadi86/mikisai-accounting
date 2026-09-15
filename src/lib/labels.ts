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

export function statusTone(s: SettlementStatus): PillTone {
  if (s === "received_in_bank") return "sage";
  if (s === "settled_not_withdrawn") return "gold";
  return "gold";
}

export function platformTone(p: Platform): PillTone {
  if (p === "tiktok") return "ink";
  if (p === "shopee") return "clay";
  if (p === "fb") return "sage";
  return "neutral";
}
