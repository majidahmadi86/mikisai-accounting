const formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** All amounts are Thai baht. */
export function thb(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}฿${formatter.format(Math.abs(amount))}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatDate(iso: string, locale: "en" | "th" = "en"): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateTime(iso: string, locale: "en" | "th" = "en"): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Whole-number baht for headline figures, two decimals otherwise. */
export function thbShort(amount: number): string {
  return Number.isInteger(amount) ? `${amount < 0 ? "-" : ""}฿${Math.abs(amount).toLocaleString("en-US")}` : thb(amount);
}
