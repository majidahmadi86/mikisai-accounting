import { round2 } from "@/lib/money";
import { addDays, thisWeek, type Period } from "@/lib/reports/period";
import type { TransactionItemRow } from "./reports";
import { valueStock, type Product, type StockMovement } from "./valuation";

export type Granularity = "day" | "week" | "month";
export type UnitsRowKind = "day" | "week" | "month" | "total";

export type UnitsRow = {
  kind: UnitsRowKind;
  /** First and last day of the bucket, clipped to the period. */
  from: string;
  to: string;
  product: Product;
  orders: number;
  unitsSold: number;
  unitsBought: number;
  samplesOut: number;
  /** Units back from cancelled or refunded orders. */
  unitsReturned: number;
  /** Stock at the end of the bucket; negative stock is reported as backlog instead. */
  onHandEnd: number;
  backlogEnd: number;
  avgSalePrice: number | null;
  avgCostEnd: number;
};

export type UnitsInput = {
  products: Product[];
  movements: StockMovement[];
  items: TransactionItemRow[];
  sales: { id: string; date: string }[];
};

export type UnitsReport = { period: Period; granularity: Granularity; rows: UnitsRow[]; totals: UnitsRow[] };

/** Last 14 days ending today: the default view of the Units report. */
export function last14Days(today: string): Period {
  return { key: "custom", from: addDays(today, -13), to: today };
}

function weekStart(date: string): string {
  return thisWeek(date).from;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

function bucketKey(date: string, g: Granularity): string {
  return g === "day" ? date : g === "week" ? weekStart(date) : monthStart(date);
}

function bucketRange(key: string, g: Granularity, period: Period): { from: string; to: string } {
  const from = key < period.from ? period.from : key;
  const rawTo = g === "day" ? key : g === "week" ? addDays(key, 6) : monthEnd(key);
  return { from, to: rawTo > period.to ? period.to : rawTo };
}

type Acc = { orders: Set<string>; unitsSold: number; unitsBought: number; samplesOut: number; unitsReturned: number; priceWeight: number; priceUnits: number };
const fresh = (): Acc => ({ orders: new Set(), unitsSold: 0, unitsBought: 0, samplesOut: 0, unitsReturned: 0, priceWeight: 0, priceUnits: 0 });

/**
 * Units per product per bucket: orders, units sold and bought, samples out,
 * stock (or backlog) at the bucket end, average sale price and average cost.
 * With day granularity the rows carry weekly and monthly subtotals too.
 */
export function buildUnitsReport(input: UnitsInput, period: Period, granularity: Granularity = "day"): UnitsReport {
  const products = input.products.filter((p) => !p.deleted_at);
  const byId = new Map(products.map((p) => [p.id, p]));
  const saleDate = new Map(input.sales.map((s) => [s.id, s.date]));
  const inPeriod = (d: string) => d >= period.from && d <= period.to;

  // Movements drive units; items drive the sale price.
  const cells = new Map<string, Map<string, Acc>>(); // bucketKey -> productId -> acc
  const touch = (key: string, productId: string): Acc => {
    let m = cells.get(key);
    if (!m) cells.set(key, (m = new Map()));
    let a = m.get(productId);
    if (!a) m.set(productId, (a = fresh()));
    return a;
  };
  for (const m of input.movements) {
    if (!inPeriod(m.date) || !byId.has(m.product_id)) continue;
    const a = touch(bucketKey(m.date, granularity), m.product_id);
    if (m.kind === "sale") {
      a.unitsSold += -m.qty;
      if (m.transaction_id) a.orders.add(m.transaction_id);
    } else if (m.kind === "purchase") a.unitsBought += m.qty;
    else if (m.kind === "sample") a.samplesOut += -m.qty;
    else if (m.kind === "return" && m.qty > 0) a.unitsReturned += m.qty;
  }
  for (const it of input.items) {
    const d = saleDate.get(it.transaction_id);
    if (!d || !inPeriod(d) || !byId.has(it.product_id)) continue;
    const a = touch(bucketKey(d, granularity), it.product_id);
    a.priceWeight += it.qty * it.unit_price;
    a.priceUnits += it.qty;
  }

  const stockAt = (asOf: string, productId: string) => {
    const v = valueStock(products, input.movements.filter((m) => m.date <= asOf)).products.find((r) => r.product.id === productId);
    return { onHand: v ? Math.max(0, v.onHand) : 0, backlog: v?.backlog ?? 0, avg: v?.avgCost ?? 0 };
  };

  const toRow = (kind: UnitsRowKind, from: string, to: string, product: Product, a: Acc): UnitsRow => {
    const end = stockAt(to, product.id);
    return {
      kind,
      from,
      to,
      product,
      orders: a.orders.size,
      unitsSold: a.unitsSold,
      unitsBought: a.unitsBought,
      samplesOut: a.samplesOut,
      unitsReturned: a.unitsReturned,
      onHandEnd: end.onHand,
      backlogEnd: end.backlog,
      avgSalePrice: a.priceUnits > 0 ? round2(a.priceWeight / a.priceUnits) : null,
      avgCostEnd: end.avg,
    };
  };
  const merge = (into: Acc, a: Acc) => {
    a.orders.forEach((o) => into.orders.add(o));
    into.unitsSold += a.unitsSold;
    into.unitsBought += a.unitsBought;
    into.samplesOut += a.samplesOut;
    into.unitsReturned += a.unitsReturned;
    into.priceWeight += a.priceWeight;
    into.priceUnits += a.priceUnits;
  };
  const productOrder = (a: Product, b: Product) => a.name.localeCompare(b.name) || a.variant.localeCompare(b.variant);

  const keys = Array.from(cells.keys()).sort();
  const rows: UnitsRow[] = [];
  const weekAcc = new Map<string, Map<string, Acc>>();
  const monthAcc = new Map<string, Map<string, Acc>>();
  const grand = new Map<string, Acc>();

  const flush = (acc: Map<string, Map<string, Acc>>, key: string, kind: "week" | "month") => {
    const m = acc.get(key);
    if (!m) return;
    const range = bucketRange(key, kind, period);
    for (const [pid, a] of Array.from(m.entries()).sort((x, y) => productOrder(byId.get(x[0])!, byId.get(y[0])!))) rows.push(toRow(kind, range.from, range.to, byId.get(pid)!, a));
    acc.delete(key);
  };

  let currentWeek: string | null = null;
  let currentMonth: string | null = null;
  for (const key of keys) {
    const range = bucketRange(key, granularity, period);
    const wk = weekStart(range.from);
    const mo = monthStart(range.from);
    if (granularity === "day") {
      if (currentWeek && currentWeek !== wk) flush(weekAcc, currentWeek, "week");
      if (currentMonth && currentMonth !== mo) flush(monthAcc, currentMonth, "month");
      currentWeek = wk;
      currentMonth = mo;
    }
    const m = cells.get(key)!;
    for (const [pid, a] of Array.from(m.entries()).sort((x, y) => productOrder(byId.get(x[0])!, byId.get(y[0])!))) {
      rows.push(toRow(granularity, range.from, range.to, byId.get(pid)!, a));
      if (granularity === "day") {
        merge(touchIn(weekAcc, wk, pid), a);
        merge(touchIn(monthAcc, mo, pid), a);
      }
      let g = grand.get(pid);
      if (!g) grand.set(pid, (g = fresh()));
      merge(g, a);
    }
  }
  if (granularity === "day") {
    if (currentWeek) flush(weekAcc, currentWeek, "week");
    if (currentMonth) flush(monthAcc, currentMonth, "month");
  }

  const totals = Array.from(grand.entries())
    .sort((x, y) => productOrder(byId.get(x[0])!, byId.get(y[0])!))
    .map(([pid, a]) => toRow("total", period.from, period.to, byId.get(pid)!, a));

  return { period, granularity, rows, totals };
}

function touchIn(map: Map<string, Map<string, Acc>>, key: string, productId: string): Acc {
  let m = map.get(key);
  if (!m) map.set(key, (m = new Map()));
  let a = m.get(productId);
  if (!a) m.set(productId, (a = fresh()));
  return a;
}

/** Short product name for ledger rows, chips, Home and Units: the admin-set short name, else the variant, else the name. */
export function shortProductName(p: Pick<Product, "name" | "variant" | "name_th" | "short_name">, locale: "en" | "th" = "en"): string {
  if (p.short_name) return p.short_name;
  if (p.variant) return p.variant;
  return locale === "th" && p.name_th ? p.name_th : p.name;
}

/** Picker row: variant first, then the product name. Never truncated. */
export function pickerParts(p: Pick<Product, "name" | "variant" | "name_th">, locale: "en" | "th" = "en"): { variant: string; name: string } {
  return { variant: p.variant, name: locale === "th" && p.name_th ? p.name_th : p.name };
}

export type ItemsSummary = { count: number; units: number; lines: string[]; label: string };

/** What a ledger row sold or bought: "10 kg box × 2", or "3 items" with one line per product. */
export function summariseItems(items: { product_id: string; qty: number }[], products: Map<string, Product>, locale: "en" | "th" = "en", itemsWord = (n: number) => `${n} items`): ItemsSummary | null {
  if (!items.length) return null;
  const lines = items.map((i) => {
    const p = products.get(i.product_id);
    return `${p ? shortProductName(p, locale) : "?"} × ${i.qty}`;
  });
  const units = items.reduce((a, i) => a + i.qty, 0);
  return { count: items.length, units, lines, label: items.length === 1 ? lines[0] : itemsWord(items.length) };
}
