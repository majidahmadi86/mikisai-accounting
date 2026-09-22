import { round2 } from "@/lib/money";
import { remainingOn } from "@/lib/truth";
import { addDays, daysBetween } from "@/lib/reports/period";
import type { ReportInput, ReportTx } from "@/lib/reports/build";
import { PLATFORMS, PRODUCT_LINES, type Platform, type ProductLine } from "@/lib/types";

export const DEFAULT_LAG_DAYS = 10;
export const STALE_ORDER_DAYS = 20;
export const DRIFT_THRESHOLD_PCT = 10;

export type Trend = "rising" | "falling" | "steady" | "none";
export type ProductTag = "push" | "review_pricing" | null;

export type ProductInsight = {
  product: ProductLine;
  orders30: number;
  units30: number;
  net30: number;
  expenses30: number;
  profit30: number;
  netPerUnit30: number;
  marginPerUnit30: number;
  unitsPerDay7: number;
  unitsPerDay30: number;
  trend: Trend;
  tag: ProductTag;
  drift: { current: number; baseline: number; dropPct: number } | null;
  bestPlatform: { platform: Platform; netPerOrder: number; orders: number } | null;
};

export type CashForecastRow = {
  platform: Platform;
  orders: number;
  pending: number;
  lagDays: number;
  observedLag: boolean;
  next7: number;
  later: number;
  overdue: number;
  nextArrival: string | null;
};

export type Exception =
  | { kind: "unmatched_payout"; id: string; date: string; platform: Platform; amount: number }
  | { kind: "stale_order"; id: string; date: string; platform: Platform; amount: number; days: number; customer: string | null };

export type Insights = {
  asOf: string;
  products: ProductInsight[];
  cash: CashForecastRow[];
  cashTotal: number;
  exceptions: Exception[];
  drifting: ProductInsight[];
};

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function within(t: ReportTx, from: string, to: string): boolean {
  return t.date >= from && t.date <= to;
}

/** Median days from order date to the day the money reached the bank, per platform. */
export function observedLagDays(tx: ReportTx[], today: string): Record<Platform, { days: number; observed: boolean }> {
  const since = addDays(today, -180);
  const out = {} as Record<Platform, { days: number; observed: boolean }>;
  for (const platform of PLATFORMS) {
    const lags = tx
      .filter((t) => t.type === "income" && t.platform === platform && t.date >= since && t.settlement?.status === "received_in_bank" && t.settlement.settled_at)
      .map((t) => Math.max(0, daysBetween(t.date, t.settlement!.settled_at!.slice(0, 10))));
    const m = median(lags);
    out[platform] = m === null ? { days: DEFAULT_LAG_DAYS, observed: false } : { days: Math.round(m), observed: true };
  }
  return out;
}

export function buildProductInsights(tx: ReportTx[], today: string, cogsByTransaction?: Map<string, number>): ProductInsight[] {
  const from30 = addDays(today, -29);
  const from7 = addDays(today, -6);
  const from90 = addDays(today, -89);

  const rows = PRODUCT_LINES.map((product): ProductInsight => {
    const income30 = tx.filter((t) => t.type === "income" && t.product_line === product && within(t, from30, today));
    const income7 = income30.filter((t) => t.date >= from7);
    // Prefer the true cost of units sold (moving average) when stock is tracked; fall back to the line's expenses.
    const cogs30 = cogsByTransaction ? sum(income30.map((t) => cogsByTransaction.get(t.id) ?? 0)) : 0;
    // With stock tracked the product cost is the cost of the units sold; the old cash fallback only serves ledgers without movements.
    const expenses30 = cogsByTransaction ? cogs30 : sum(tx.filter((t) => t.type === "expense" && t.product_line === product && within(t, from30, today)).map((t) => t.net_amount));
    const units30 = income30.reduce((a, t) => a + t.quantity, 0);
    const units7 = income7.reduce((a, t) => a + t.quantity, 0);
    const net30 = sum(income30.map((t) => t.net_amount));
    const net7 = sum(income7.map((t) => t.net_amount));
    const profit30 = round2(net30 - expenses30);
    const unitsPerDay30 = round2(units30 / 30);
    const unitsPerDay7 = round2(units7 / 7);

    let trend: Trend = "none";
    if (units30 > 0) {
      if (units7 >= 2 && unitsPerDay7 >= unitsPerDay30 * 1.2) trend = "rising";
      else if (units30 >= 3 && unitsPerDay7 <= unitsPerDay30 * 0.8) trend = "falling";
      else trend = "steady";
    }

    const netPerUnit30 = units30 > 0 ? round2(net30 / units30) : 0;
    const netPerUnit7 = units7 > 0 ? round2(net7 / units7) : 0;
    let drift: ProductInsight["drift"] = null;
    if (units7 >= 2 && units30 > units7 && netPerUnit30 > 0) {
      const dropPct = round2(((netPerUnit30 - netPerUnit7) / netPerUnit30) * 100);
      if (dropPct > DRIFT_THRESHOLD_PCT) drift = { current: netPerUnit7, baseline: netPerUnit30, dropPct };
    }

    const income90 = tx.filter((t) => t.type === "income" && t.product_line === product && within(t, from90, today));
    let bestPlatform: ProductInsight["bestPlatform"] = null;
    for (const platform of PLATFORMS) {
      const rows90 = income90.filter((t) => t.platform === platform);
      if (!rows90.length) continue;
      const netPerOrder = round2(sum(rows90.map((t) => t.net_amount)) / rows90.length);
      if (!bestPlatform || netPerOrder > bestPlatform.netPerOrder) bestPlatform = { platform, netPerOrder, orders: rows90.length };
    }

    return {
      product,
      orders30: income30.length,
      units30,
      net30,
      expenses30,
      profit30,
      netPerUnit30,
      marginPerUnit30: units30 > 0 ? round2(profit30 / units30) : 0,
      unitsPerDay7,
      unitsPerDay30,
      trend,
      tag: null,
      drift,
      bestPlatform,
    };
  }).filter((r) => r.orders30 > 0 || r.expenses30 > 0);

  rows.sort((a, b) => b.profit30 - a.profit30);
  const best = rows.find((r) => r.units30 > 0 && r.marginPerUnit30 > 0);
  for (const r of rows) {
    if (r.units30 > 0 && (r.marginPerUnit30 <= 0 || r.drift)) r.tag = "review_pricing";
    else if (best && r === best && r.trend !== "falling") r.tag = "push";
  }
  return rows;
}

export function buildCashForecast(tx: ReportTx[], today: string): CashForecastRow[] {
  const lag = observedLagDays(tx, today);
  const horizon = addDays(today, 7);
  return PLATFORMS.map((platform): CashForecastRow => {
    // Still to come, the one definition (truth.remainingOn): each order's net less what already reached a partner.
    const waiting = tx.filter((t) => t.platform === platform && remainingOn(t, today) > 0).map((t) => ({ ...t, net_amount: remainingOn(t, today) }));
    let next7 = 0;
    let later = 0;
    let overdue = 0;
    let nextArrival: string | null = null;
    for (const t of waiting) {
      const expected = addDays(t.date, lag[platform].days);
      if (expected < today) overdue += t.net_amount;
      else if (expected <= horizon) next7 += t.net_amount;
      else later += t.net_amount;
      const candidate = expected < today ? today : expected;
      if (!nextArrival || candidate < nextArrival) nextArrival = candidate;
    }
    return {
      platform,
      orders: waiting.length,
      pending: sum(waiting.map((t) => t.net_amount)),
      lagDays: lag[platform].days,
      observedLag: lag[platform].observed,
      next7: round2(next7),
      later: round2(later),
      overdue: round2(overdue),
      nextArrival,
    };
  }).filter((r) => r.orders > 0);
}

export function buildExceptions(input: ReportInput, today: string): Exception[] {
  const matched = new Set(input.transactions.map((t) => t.settlement?.payout_id).filter((id): id is string => Boolean(id)));
  const unmatched: Exception[] = input.payouts
    .filter((p) => !matched.has(p.id))
    .map((p) => ({ kind: "unmatched_payout", id: p.id, date: p.date, platform: p.platform, amount: p.amount_received }));
  const stale: Exception[] = input.transactions
    .filter((t) => t.type === "income" && (t.settlement?.status ?? "pending") !== "received_in_bank" && daysBetween(t.date, today) > STALE_ORDER_DAYS)
    .map((t) => ({ kind: "stale_order", id: t.id, date: t.date, platform: t.platform, amount: t.net_amount, days: daysBetween(t.date, today), customer: t.customer_name }));
  return [...unmatched, ...stale].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildInsights(input: ReportInput, today: string, cogsByTransaction?: Map<string, number>): Insights {
  const products = buildProductInsights(input.transactions, today, cogsByTransaction);
  const cash = buildCashForecast(input.transactions, today);
  return {
    asOf: today,
    products,
    cash,
    cashTotal: sum(cash.map((c) => c.pending)),
    exceptions: buildExceptions(input, today),
    drifting: products.filter((p) => p.drift),
  };
}
