import type { Translator } from "@/lib/i18n/dictionary";
import type { PillTone } from "@/components/ui/Pill";
import type { Person, Platform, ProductLine, SettlementStatus } from "@/lib/types";

export function platformName(tr: Translator, p: Platform): string {
  return tr(`platform.${p}`);
}

export function productName(tr: Translator, p: ProductLine): string {
  return tr(`product.${p}`);
}

/** Where the money of a sale is, in plain words that name the platform: "Waiting for TikTok". Without a platform (filters) it says "the platform". */
export function statusName(tr: Translator, s: SettlementStatus, platform?: Platform | null): string {
  return tr(`status.${s}`, { platform: platform && platform !== "other" ? tr(`platform.${platform}`) : tr("status.thePlatform") });
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
