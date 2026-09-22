/**
 * Data health for the TikTok Finance statement: what it corrected, what it has
 * not reached yet, which days no statement covers, and what overweight
 * parcels and returns cost this week. Pure: the snapshot in, issues out.
 */
import { round2 } from "@/lib/money";
import { daysBetween } from "@/lib/reports/period";

export const STATEMENT_KEYS = ["statement_duplicates", "net_fixed", "no_statement_10d", "statement_cross", "advance_estimated", "statement_gaps", "overweight_week", "returns_week"] as const;
export type StatementHealthKey = (typeof STATEMENT_KEYS)[number];

export type MoneyIssue = { id: string; label: string; href: string | null; detail?: string; meta?: Record<string, string | number> };

export type MoneyFact = { order_ref: string; kind: "order" | "refund"; transaction_id: string | null; settled_date: string | null; settlement_amount: number; fee_seller_shipping: number; chargeable_weight_g: number | null; boxes: number; overweight: boolean; pre_business: boolean; ledger_net_before: number | null };
export type MoneyInput = {
  startDate: string;
  allocations: { order_ref: string; date: string; amount: number }[];
  facts: MoneyFact[];
  periods: { from: string; to: string }[];
  /** Stored statement rows that repeat another: a wallet copy of an advance, or the same order twice. */
  duplicates?: { id: string; kind: string; date: string; amount: number }[];
};
export type MoneyOrder = { id: string; order_ref?: string | null; date: string; net_amount: number; platform: string; type: string; status?: string; settlement: { status: string } | null };

export const NO_STATEMENT_DAYS = 10;
const WEEK = 7;
const baht = (n: number) => `฿${n.toFixed(2)}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const href = (f: { transaction_id: string | null }) => (f.transaction_id ? `/transactions/${f.transaction_id}/edit` : "/more/before");

/** Days from the first statement to yesterday that no statement covers, as ranges. */
export function coverageGaps(periods: { from: string; to: string }[], startDate: string, today: string): { from: string; to: string; days: number }[] {
  if (!periods.length) return [];
  const sorted = [...periods].sort((a, b) => a.from.localeCompare(b.from));
  const gaps: { from: string; to: string; days: number }[] = [];
  let cursor = sorted[0].from > startDate ? startDate : sorted[0].from;
  const end = addDays(today, -1);
  for (const p of sorted) {
    if (p.from > cursor) gaps.push({ from: cursor, to: addDays(p.from, -1), days: daysBetween(cursor, p.from) });
    const next = addDays(p.to, 1);
    if (next > cursor) cursor = next;
  }
  if (cursor <= end) gaps.push({ from: cursor, to: end, days: daysBetween(cursor, end) + 1 });
  return gaps.filter((g) => g.days > 0 && g.to >= startDate);
}

export function statementHealth(money: MoneyInput | undefined, orders: MoneyOrder[], cross: { missing_from_orders?: unknown; missing_from_statement?: unknown } | undefined, today: string): Record<StatementHealthKey, MoneyIssue[]> {
  const out: Record<StatementHealthKey, MoneyIssue[]> = { statement_duplicates: [], net_fixed: [], no_statement_10d: [], statement_cross: [], advance_estimated: [], statement_gaps: [], overweight_week: [], returns_week: [] };
  if (!money) return out;
  const weekAgo = addDays(today, -WEEK);

  // The same statement row stored twice counts its money twice.
  const seen = new Map<string, number>();
  for (const f of money.facts) seen.set(`${f.order_ref}:${f.kind}`, (seen.get(`${f.order_ref}:${f.kind}`) ?? 0) + 1);
  out.statement_duplicates = [
    ...(money.duplicates ?? []).map((d) => ({ id: d.id, label: `${d.date} · ${d.kind.replace("_", " ")} · ${baht(d.amount)}`, href: "/payouts", meta: { amount: d.amount } })),
    ...Array.from(seen).filter(([, n]) => n > 1).map(([key, n]) => ({ id: key, label: `#${key.split(":")[0]}`, href: `/search?q=${key.split(":")[0]}`, detail: `${n}x` })),
  ];
  const business = money.facts.filter((f) => !f.pre_business);
  const recent = (f: MoneyFact) => Boolean(f.settled_date && f.settled_date > weekAgo);

  // Fixed from the TikTok statement, shown for a week after the day it settled.
  out.net_fixed = business.filter((f) => f.kind === "order" && f.ledger_net_before != null && recent(f)).map((f) => ({ id: f.order_ref, label: `#${f.order_ref}`, href: href(f), detail: `${baht(f.ledger_net_before as number)} → ${baht(f.settlement_amount)}`, meta: { old: f.ledger_net_before as number, new: f.settlement_amount } }));

  // In the ledger, but no statement has spoken about it after ten days. Only once statements are being imported at all.
  if (money.periods.length) {
    const known = new Set(money.facts.map((f) => f.order_ref));
    out.no_statement_10d = orders
      .filter((t) => t.type === "income" && t.platform === "tiktok" && (t.status ?? "active") === "active" && t.order_ref && !known.has(t.order_ref) && t.date >= money.startDate && daysBetween(t.date, today) > NO_STATEMENT_DAYS)
      .map((t) => ({ id: t.id, label: `${t.date} · #${t.order_ref} · ${baht(t.net_amount)}`, href: `/transactions/${t.id}/edit`, detail: `${daysBetween(t.date, today)} days` }));
  }

  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  out.statement_cross = [
    ...list(cross?.missing_from_orders).map((ref) => ({ id: `s:${ref}`, label: `#${ref}`, href: `/search?q=${ref}`, meta: { side: "orders" } })),
    ...list(cross?.missing_from_statement).map((ref) => ({ id: `o:${ref}`, label: `#${ref}`, href: `/search?q=${ref}`, meta: { side: "statement" } })),
  ];

  out.advance_estimated = money.allocations.map((a) => ({ id: a.order_ref, label: `${a.date} · #${a.order_ref}`, href: `/search?q=${a.order_ref}`, detail: baht(a.amount), meta: { amount: a.amount } }));

  out.statement_gaps = coverageGaps(money.periods, money.startDate, today).map((g) => ({ id: g.from, label: g.from === g.to ? g.from : `${g.from} → ${g.to}`, href: "/import", detail: `${g.days}`, meta: { days: g.days } }));

  // What a normal parcel costs to ship per box, from the parcels that were not overweight.
  const normal = business.filter((f) => f.kind === "order" && !f.overweight && f.fee_seller_shipping < 0).map((f) => Math.abs(f.fee_seller_shipping) / Math.max(1, f.boxes)).sort((a, b) => a - b);
  const typical = normal.length ? normal[Math.floor(normal.length / 2)] : 0;
  out.overweight_week = business
    .filter((f) => f.kind === "order" && f.overweight && recent(f))
    .map((f) => {
      const lost = Math.max(0, round2(Math.abs(f.fee_seller_shipping) - typical * Math.max(1, f.boxes)));
      return { id: f.order_ref, label: `#${f.order_ref}`, href: href(f), detail: `${((f.chargeable_weight_g ?? 0) / 1000).toFixed(1)} kg · ${baht(lost)}`, meta: { lost, kg: round2((f.chargeable_weight_g ?? 0) / 1000) } };
    });

  out.returns_week = business.filter((f) => f.kind === "refund" && recent(f)).map((f) => ({ id: f.order_ref, label: `#${f.order_ref}`, href: href(f), detail: baht(Math.abs(f.settlement_amount)), meta: { lost: Math.abs(f.settlement_amount) } }));
  return out;
}

/** The week's total behind a check that carries money (overweight parcels, returns). */
export function lostTotal(issues: MoneyIssue[]): number {
  return round2(issues.reduce((a, i) => a + Number(i.meta?.lost ?? 0), 0));
}
