import { whoOwesWhom } from "./truth";
import { round2 } from "./money";
import { addDays } from "./reports/period";
import type { ReportTransfer, ReportTx } from "./reports/build";
import { PLATFORMS, type Person, type Platform, type TransferKind, type TransferReason } from "./types";

export type BalanceTransferInput = ReportTransfer & { kind: TransferKind; reason: TransferReason };
export type PayoutTiming = { platform: Platform; settlement_lag_days: number; daily_payout_pct: number };

export type MyBalanceInput = {
  transactions: ReportTx[];
  transfers: BalanceTransferInput[];
  settings: PayoutTiming[];
  exposureLimit: number;
  /** Total stock on hand at moving average cost. */
  stockValue?: number;
};

export type Arrival = { date: string; amount: number; early: boolean };

export type IncomingRow = {
  platform: Platform;
  orders: number;
  /** Half of the net still with the platform. */
  myShare: number;
  /** Full net still with the platform, for context. */
  total: number;
  arrivals: Arrival[];
  nextArrival: string | null;
  lastArrival: string | null;
  overdue: number;
  lagDays: number;
  earlyPct: number;
};

export type ExposureLevel = "ok" | "amber" | "red";

export type MyBalance = {
  me: Person;
  partner: Person;
  /** (a) money already in the partner's bank that is mine. */
  owedToMe: number;
  /** The reverse: what I hold above my share. */
  iOwe: number;
  /** (b) half of everything still with the platforms. */
  incoming: IncomingRow[];
  incomingTotal: number;
  /** (c) = (a) + (b). */
  exposure: number;
  exposureLimit: number;
  exposurePct: number;
  level: ExposureLevel;
  /** (d) one transfer that brings both partners back to even. */
  action: { from: Person; to: Person; amount: number } | null;
  /** (e) my own money put in to buy stock. */
  capital: BalanceTransferInput[];
  capitalTotal: number;
  /** (f) exposure per day, oldest first. */
  series: { date: string; value: number }[];
  /** My half of the stock on hand at cost. Money in unsold products, kept apart from cash exposure. */
  stockShare: number;
  stockValue: number;
};

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

/** Whether an income row is still with the platform on a given day. */
function waitingOn(t: ReportTx, asOf: string): boolean {
  if (t.type !== "income" || t.date > asOf) return false;
  const status = t.settlement?.status ?? "pending";
  if (status !== "received_in_bank") return true;
  const settledAt = t.settlement?.settled_at?.slice(0, 10) ?? null;
  return !!settledAt && settledAt > asOf;
}

/**
 * Expected arrivals for one waiting order. With the early-payout feature on
 * (daily_payout_pct below 100) part of the order lands the same day it was
 * settled, or the order day if it was never settled; the rest lands after the
 * platform's usual lag.
 */
export function arrivalsFor(t: ReportTx, timing: PayoutTiming): Arrival[] {
  const pct = Math.min(100, Math.max(0, timing.daily_payout_pct));
  const lagDate = addDays(t.date, Math.max(0, timing.settlement_lag_days));
  if (pct >= 100) return [{ date: lagDate, amount: round2(t.net_amount), early: false }];
  const earlyDate = t.settlement?.settled_at?.slice(0, 10) ?? t.date;
  const early = round2((t.net_amount * pct) / 100);
  const rest = round2(t.net_amount - early);
  const out: Arrival[] = [];
  if (early > 0) out.push({ date: earlyDate, amount: early, early: true });
  if (rest > 0) out.push({ date: lagDate, amount: rest, early: false });
  return out;
}

export function timingFor(settings: PayoutTiming[], platform: Platform): PayoutTiming {
  return settings.find((s) => s.platform === platform) ?? { platform, settlement_lag_days: 10, daily_payout_pct: 100 };
}

export function buildIncoming(transactions: ReportTx[], settings: PayoutTiming[], today: string): IncomingRow[] {
  return PLATFORMS.map((platform): IncomingRow => {
    const timing = timingFor(settings, platform);
    const waiting = transactions.filter((t) => t.platform === platform && waitingOn(t, today));
    const arrivals = waiting.flatMap((t) => arrivalsFor(t, timing)).sort((a, b) => a.date.localeCompare(b.date));
    const total = sum(waiting.map((t) => t.net_amount));
    const future = arrivals.filter((a) => a.date >= today);
    return {
      platform,
      orders: waiting.length,
      myShare: round2(total / 2),
      total,
      arrivals,
      nextArrival: future[0]?.date ?? null,
      lastArrival: arrivals.length ? arrivals[arrivals.length - 1].date : null,
      overdue: sum(arrivals.filter((a) => a.date < today).map((a) => a.amount)),
      lagDays: timing.settlement_lag_days,
      earlyPct: timing.daily_payout_pct,
    };
  }).filter((r) => r.orders > 0);
}

export function exposureLevel(exposure: number, limit: number): ExposureLevel {
  if (limit <= 0) return exposure > 0 ? "red" : "ok";
  const pct = exposure / limit;
  if (pct > 1) return "red";
  if (pct >= 0.8) return "amber";
  return "ok";
}

/** (a) + (b) as they stood at the end of a given day. */
export function exposureOn(input: MyBalanceInput, me: Person, asOf: string): number {
  const b = whoOwesWhom(input, asOf);
  const owed = Math.max(0, -b.delta[me]);
  const waiting = sum(input.transactions.filter((t) => waitingOn(t, asOf)).map((t) => t.net_amount));
  return round2(owed + waiting / 2);
}

export function buildMyBalance(input: MyBalanceInput, me: Person, today: string): MyBalance {
  const partner: Person = me === "mike" ? "sai" : "mike";
  const balance = whoOwesWhom(input, today);
  const delta = balance.delta[me];
  const owedToMe = round2(Math.max(0, -delta));
  const iOwe = round2(Math.max(0, delta));

  const incoming = buildIncoming(input.transactions, input.settings, today);
  const incomingTotal = sum(incoming.map((r) => r.myShare));
  const exposure = round2(owedToMe + incomingTotal);
  const exposurePct = input.exposureLimit > 0 ? round2((exposure / input.exposureLimit) * 100) : exposure > 0 ? 999 : 0;

  let action: MyBalance["action"] = null;
  if (owedToMe >= 1) action = { from: partner, to: me, amount: owedToMe };
  else if (iOwe >= 1) action = { from: me, to: partner, amount: iOwe };

  const capital = input.transfers.filter((t) => t.kind === "capital" && t.from_person === me).sort((a, b) => b.date.localeCompare(a.date));

  const series: MyBalance["series"] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    series.push({ date, value: exposureOn(input, me, date) });
  }

  return {
    me,
    partner,
    owedToMe,
    iOwe,
    incoming,
    incomingTotal,
    exposure,
    exposureLimit: input.exposureLimit,
    exposurePct,
    level: exposureLevel(exposure, input.exposureLimit),
    action,
    capital,
    capitalTotal: sum(capital.map((t) => t.amount)),
    series,
    stockValue: round2(input.stockValue ?? 0),
    stockShare: round2((input.stockValue ?? 0) / 2),
  };
}
