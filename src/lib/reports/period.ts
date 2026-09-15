import { todayIso } from "@/lib/money";

export type PeriodKey = "week" | "month" | "custom";
export type Period = { key: PeriodKey; from: string; to: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function utc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function addDays(isoDate: string, days: number): string {
  const d = utc(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utc(toIso).getTime() - utc(fromIso).getTime()) / 86_400_000);
}

/** Monday to Sunday of the week containing `today`. */
export function thisWeek(today = todayIso()): Period {
  const d = utc(today);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const from = addDays(today, -dow);
  return { key: "week", from, to: addDays(from, 6) };
}

export function thisMonth(today = todayIso()): Period {
  const d = utc(today);
  const from = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { key: "month", from, to: iso(end) };
}

/** Reads ?period=week|month|custom&from=&to= with safe fallbacks. */
export function resolvePeriod(sp: { period?: unknown; from?: unknown; to?: unknown }, today = todayIso()): Period {
  const key = sp.period === "week" || sp.period === "custom" ? sp.period : "month";
  if (key === "week") return thisWeek(today);
  if (key === "custom") {
    const from = typeof sp.from === "string" && ISO.test(sp.from) ? sp.from : null;
    const to = typeof sp.to === "string" && ISO.test(sp.to) ? sp.to : null;
    if (from && to && from <= to) return { key: "custom", from, to };
    if (from && !to) return { key: "custom", from, to: today >= from ? today : from };
  }
  return thisMonth(today);
}

export function inPeriod(date: string, period: Period): boolean {
  return date >= period.from && date <= period.to;
}

/** Month-end dates inside the period, plus the period end itself when it is not a month end. */
export function checkpoints(period: Period): string[] {
  const out: string[] = [];
  let d = utc(period.from);
  for (;;) {
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const endIso = iso(end);
    if (endIso > period.to) break;
    out.push(endIso);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  if (out[out.length - 1] !== period.to) out.push(period.to);
  return out;
}

export function periodQuery(period: Period): string {
  return period.key === "custom" ? `period=custom&from=${period.from}&to=${period.to}` : `period=${period.key}`;
}
