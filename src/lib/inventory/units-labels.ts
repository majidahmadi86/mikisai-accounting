import type { Locale } from "@/lib/i18n/dictionary";
import type { UnitsRowKind } from "./units";

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function parts(iso: string): { y: number; m: number; d: number } {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

function month(m: number, locale: Locale): string {
  return (locale === "th" ? TH_MONTHS : EN_MONTHS)[m - 1];
}

/** ISO 8601 week number of a date. */
export function isoWeek(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** "15 Sept", "Wk 38 · 14–20 Sept", "Sept 2026": short, single-line period labels for the Units table. */
export function shortPeriodLabel(from: string, to: string, kind: UnitsRowKind, locale: Locale, totalWord = "Total"): string {
  const a = parts(from);
  const b = parts(to);
  const dash = String.fromCharCode(8211);
  const range = a.m === b.m ? `${a.d}${dash}${b.d} ${month(b.m, locale)}` : `${a.d} ${month(a.m, locale)}${dash}${b.d} ${month(b.m, locale)}`;
  if (kind === "day") return `${a.d} ${month(a.m, locale)}`;
  if (kind === "week") return `${locale === "th" ? "สป." : "Wk"} ${isoWeek(from)} · ${from === to ? `${a.d} ${month(a.m, locale)}` : range}`;
  if (kind === "month") return `${month(a.m, locale)} ${locale === "th" ? a.y + 543 : a.y}`;
  return `${totalWord} · ${from === to ? `${a.d} ${month(a.m, locale)}` : range}`;
}
