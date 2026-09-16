import { computeBalance, type Balance } from "@/lib/balance";
import { round2 } from "@/lib/money";
import { addDays, checkpoints, daysBetween, inPeriod, type Period } from "./period";
import type { ExpenseCategory } from "@/lib/categories";
import { PLATFORMS, PRODUCT_LINES, type Person, type Platform, type ProductLine, type SettlementStatus } from "@/lib/types";

/** Structural subset of LedgerTransaction so reports can be built and tested without the server module. */
export type ReportTx = {
  id: string;
  type: "income" | "expense";
  date: string;
  platform: Platform;
  product_line: ProductLine;
  gross_amount: number;
  net_amount: number;
  quantity: number;
  payer: Person | null;
  received_by: Person | null;
  category_id: string | null;
  customer_name: string | null;
  note: string;
  created_at: string;
  settlement: { status: SettlementStatus; settled_at: string | null; payout_id: string | null } | null;
};

export type ReportTransfer = { id: string; date: string; from_person: Person; to_person: Person; amount: number; note: string };
export type ReportPayout = { id: string; date: string; platform: Platform; amount_received: number; received_by: Person; note: string };

export type ReportInput = { transactions: ReportTx[]; transfers: ReportTransfer[]; payouts: ReportPayout[]; categories: ExpenseCategory[] };

export type PLReport = {
  orders: number;
  units: number;
  gross: number;
  net: number;
  fees: number;
  expenses: { category: ExpenseCategory; count: number; amount: number }[];
  totalExpenses: number;
  profit: number;
  byStatus: Record<SettlementStatus, number>;
};

export type ProductRow = { product: ProductLine; orders: number; units: number; gross: number; net: number; expenses: number; profit: number; netPerUnit: number };
export type PlatformRow = { platform: Platform; orders: number; gross: number; net: number; fees: number; feePct: number };
export type CategoryRow = { category: ExpenseCategory; count: number; amount: number; share: number; previous: number; changePct: number | null };
export type StatusRow = { platform: Platform; pendingOrders: number; pending: number; walletOrders: number; wallet: number; bankOrders: number; bank: number; total: number };
export type OwesRow = { asOf: string; mikeHolds: number; saiHolds: number; netProfit: number; owes: Balance["owes"] };
export type CustomerRow = { name: string; platform: Platform; orders: number; gross: number; net: number; lastOrder: string };

export type ReportBundle = {
  period: Period;
  generatedAt: string;
  pl: PLReport;
  byProduct: ProductRow[];
  byPlatform: PlatformRow[];
  byCategory: CategoryRow[];
  settlement: StatusRow[];
  owesHistory: OwesRow[];
  transfers: ReportTransfer[];
  customers: CustomerRow[];
};

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

const UNKNOWN_CATEGORY: ExpenseCategory = { id: "unknown", name_en: "Uncategorised", name_th: "ไม่ระบุหมวด", sort: 9999, active: false };

/** Categories in display order, plus a placeholder for rows whose category no longer exists. */
function categoriesFor(tx: ReportTx[], categories: ExpenseCategory[]): ExpenseCategory[] {
  const known = new Set(categories.map((c) => c.id));
  const list = [...categories].sort((a, b) => a.sort - b.sort);
  if (tx.some((t) => t.type === "expense" && (!t.category_id || !known.has(t.category_id)))) list.push(UNKNOWN_CATEGORY);
  return list;
}

function inCategory(t: ReportTx, c: ExpenseCategory, known: Set<string>): boolean {
  if (c.id === "unknown") return !t.category_id || !known.has(t.category_id);
  return t.category_id === c.id;
}

export function buildProfitLoss(tx: ReportTx[], categories: ExpenseCategory[]): PLReport {
  const income = tx.filter((t) => t.type === "income");
  const expense = tx.filter((t) => t.type === "expense");
  const gross = sum(income.map((t) => t.gross_amount));
  const net = sum(income.map((t) => t.net_amount));
  const known = new Set(categories.map((c) => c.id));
  const expenses = categoriesFor(tx, categories)
    .map((category) => {
      const rows = expense.filter((t) => inCategory(t, category, known));
      return { category, count: rows.length, amount: sum(rows.map((t) => t.net_amount)) };
    })
    .filter((r) => r.count > 0);
  const totalExpenses = sum(expenses.map((r) => r.amount));
  const byStatus: Record<SettlementStatus, number> = { pending: 0, settled_not_withdrawn: 0, received_in_bank: 0 };
  for (const t of income) byStatus[t.settlement?.status ?? "pending"] = round2(byStatus[t.settlement?.status ?? "pending"] + t.net_amount);
  return {
    orders: income.length,
    units: income.reduce((a, t) => a + t.quantity, 0),
    gross,
    net,
    fees: round2(gross - net),
    expenses,
    totalExpenses,
    profit: round2(net - totalExpenses),
    byStatus,
  };
}

export function buildByProduct(tx: ReportTx[]): ProductRow[] {
  return PRODUCT_LINES.map((product) => {
    const income = tx.filter((t) => t.type === "income" && t.product_line === product);
    const expenses = sum(tx.filter((t) => t.type === "expense" && t.product_line === product).map((t) => t.net_amount));
    const units = income.reduce((a, t) => a + t.quantity, 0);
    const net = sum(income.map((t) => t.net_amount));
    return {
      product,
      orders: income.length,
      units,
      gross: sum(income.map((t) => t.gross_amount)),
      net,
      expenses,
      profit: round2(net - expenses),
      netPerUnit: units > 0 ? round2(net / units) : 0,
    };
  })
    .filter((r) => r.orders > 0 || r.expenses > 0)
    .sort((a, b) => b.net - a.net);
}

export function buildByPlatform(tx: ReportTx[]): PlatformRow[] {
  return PLATFORMS.map((platform) => {
    const income = tx.filter((t) => t.type === "income" && t.platform === platform);
    const gross = sum(income.map((t) => t.gross_amount));
    const net = sum(income.map((t) => t.net_amount));
    const fees = round2(gross - net);
    return { platform, orders: income.length, gross, net, fees, feePct: gross > 0 ? round2((fees / gross) * 100) : 0 };
  })
    .filter((r) => r.orders > 0)
    .sort((a, b) => b.net - a.net);
}

/**
 * Expenses by category for the period, with the same-length period just
 * before it for month-over-month comparison.
 */
export function buildByCategory(tx: ReportTx[], previousTx: ReportTx[], categories: ExpenseCategory[]): CategoryRow[] {
  const expense = tx.filter((t) => t.type === "expense");
  const prev = previousTx.filter((t) => t.type === "expense");
  const total = sum(expense.map((t) => t.net_amount));
  const known = new Set(categories.map((c) => c.id));
  return categoriesFor([...tx, ...previousTx], categories)
    .map((category) => {
      const rows = expense.filter((t) => inCategory(t, category, known));
      const amount = sum(rows.map((t) => t.net_amount));
      const previous = sum(prev.filter((t) => inCategory(t, category, known)).map((t) => t.net_amount));
      const changePct = previous > 0 ? round2(((amount - previous) / previous) * 100) : null;
      return { category, count: rows.length, amount, share: total > 0 ? round2((amount / total) * 100) : 0, previous, changePct };
    })
    .filter((r) => r.count > 0 || r.previous > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** The period of equal length ending the day before this one. */
export function previousPeriod(period: Period): Period {
  const length = daysBetween(period.from, period.to) + 1;
  const to = addDays(period.from, -1);
  return { key: "custom", from: addDays(to, -(length - 1)), to };
}

export function buildSettlement(tx: ReportTx[]): StatusRow[] {
  return PLATFORMS.map((platform) => {
    const income = tx.filter((t) => t.type === "income" && t.platform === platform);
    const pick = (s: SettlementStatus) => income.filter((t) => (t.settlement?.status ?? "pending") === s);
    const p = pick("pending");
    const w = pick("settled_not_withdrawn");
    const b = pick("received_in_bank");
    return {
      platform,
      pendingOrders: p.length,
      pending: sum(p.map((t) => t.net_amount)),
      walletOrders: w.length,
      wallet: sum(w.map((t) => t.net_amount)),
      bankOrders: b.length,
      bank: sum(b.map((t) => t.net_amount)),
      total: sum(income.map((t) => t.net_amount)),
    };
  }).filter((r) => r.pendingOrders + r.walletOrders + r.bankOrders > 0);
}

/**
 * Balance as it stood at each month end in the period (and at the period
 * end). An order counts as in the bank once its settled_at is on or before
 * the checkpoint; everything else is treated as still waiting.
 */
export function buildOwesHistory(input: ReportInput, period: Period): OwesRow[] {
  return checkpoints(period).map((asOf) => {
    const cutoff = `${asOf}T23:59:59.999Z`;
    const txs = input.transactions
      .filter((t) => t.date <= asOf)
      .map((t) => ({
        type: t.type,
        platform: t.platform,
        net_amount: t.net_amount,
        payer: t.payer,
        received_by: t.received_by,
        settlement_status: (t.type === "income" ? (t.settlement?.status === "received_in_bank" && t.settlement.settled_at && t.settlement.settled_at <= cutoff ? "received_in_bank" : "pending") : null) as SettlementStatus | null,
      }));
    const transfers = input.transfers.filter((tr) => tr.date <= asOf);
    const b = computeBalance(txs, transfers);
    return { asOf, mikeHolds: b.holdings.mike, saiHolds: b.holdings.sai, netProfit: b.netProfit, owes: b.owes };
  });
}

export function buildCustomers(tx: ReportTx[]): CustomerRow[] {
  const map = new Map<string, CustomerRow>();
  for (const t of tx) {
    if (t.type !== "income" || !t.customer_name?.trim()) continue;
    const key = t.customer_name.trim().toLowerCase();
    const cur = map.get(key) ?? { name: t.customer_name.trim(), platform: t.platform, orders: 0, gross: 0, net: 0, lastOrder: t.date };
    cur.orders += 1;
    cur.gross = round2(cur.gross + t.gross_amount);
    cur.net = round2(cur.net + t.net_amount);
    if (t.date > cur.lastOrder) cur.lastOrder = t.date;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.net - a.net);
}

export function buildReports(input: ReportInput, period: Period, generatedAt = new Date().toISOString()): ReportBundle {
  const tx = input.transactions.filter((t) => inPeriod(t.date, period));
  const prev = previousPeriod(period);
  const prevTx = input.transactions.filter((t) => inPeriod(t.date, prev));
  return {
    period,
    generatedAt,
    pl: buildProfitLoss(tx, input.categories),
    byProduct: buildByProduct(tx),
    byPlatform: buildByPlatform(tx),
    byCategory: buildByCategory(tx, prevTx, input.categories),
    settlement: buildSettlement(tx),
    owesHistory: buildOwesHistory(input, period),
    transfers: input.transfers.filter((t) => inPeriod(t.date, period)),
    customers: buildCustomers(tx),
  };
}
