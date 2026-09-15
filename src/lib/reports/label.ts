import type { Locale, Translator } from "@/lib/i18n/dictionary";
import { formatDate } from "@/lib/money";
import type { Period } from "./period";

export function periodLabel(period: Period, locale: Locale, tr: Translator): string {
  const range = `${formatDate(period.from, locale)} → ${formatDate(period.to, locale)}`;
  if (period.key === "week") return `${tr("reports.thisWeek")} · ${range}`;
  if (period.key === "month") return `${tr("reports.thisMonth")} · ${range}`;
  return range;
}
