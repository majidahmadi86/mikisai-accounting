import { buildAccrualPL, buildBalanceSheet, buildCashFlow, reconcileProfit, type AccrualPL, type BalanceSheet, type CashFlow, type Reconciliation } from "@/lib/accounting/statements";
import type { Balance } from "@/lib/balance";
import { cancellations, whoOwesWhom } from "@/lib/truth";
import { round2 } from "@/lib/money";
import { addDays, checkpoints, daysBetween, inPeriod, type Period } from "./period";
import type { ExpenseCategory } from "@/lib/categories";
import { buildInventoryReports, type InventoryReports, type TransactionItemRow } from "@/lib/inventory/reports";
import { valueStock, type Product, type StockMovement } from "@/lib/inventory/valuation";
import { PLATFORMS, PRODUCT_LINES, type OrderStatus, type Person, type Platform, type ProductLine, type SettlementStatus } from "@/lib/types";
import type { ClawbackLite } from "@/lib/truth";
import type { TruthTransfer } from "@/lib/truth";

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
  order_ref?: string | null;
  status?: OrderStatus;
  status_date?: string | null;
  refund_amount?: number | null;
  tags?: string[];
  /** A cash adjustment row built by truth.normalizeLedger, never a real order. */
  synthetic?: boolean;
  created_at: string;
  settlement: { status: SettlementStatus; settled_at: string | null; payout_id: string | null; paid_amount?: number } | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ReportTransfer = { id: string; date: string; from_person: Person; to_person: Person; amount: number; note: string };
export type ReportPayout = { id: string; date: string; platform: Platform; amount_received: number; received_by: Person; note: string; external_ref?: string | null };

export type ReportInput = {
  transactions: ReportTx[];
  transfers: ReportTransfer[];
  payouts: ReportPayout[];
  categories: ExpenseCategory[];
  /** Platform fee percentages, for the default expected net per unit. */
  settings?: { platform: Platform; commission_pct: number }[];
  products?: Product[];
  movements?: StockMovement[];
  items?: TransactionItemRow[];
  /** From truth.normalizeLedger: cash that moved for cancelled orders and clawbacks. */
  cashAdjustments?: ReportTx[];
  /** Cancelled and refunded sales as recorded. */
  cancelled?: ReportTx[];
  clawbacks?: ClawbackLite[];
};

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
  /** Sales cancelled or refunded in the period and the money taken back; already out of the figures above. */
  cancelled: { count: number; amount: number };
};

/** Per product line: what you received, the cost of the units sold (moving average) and the gross margin. */
export type ProductRow = { product: ProductLine; orders: number; units: number; gross: number; net: number; cogs: number; grossMargin: number; netPerUnit: number };
export type PlatformRow = { platform: Platform; orders: number; gross: number; net: number; fees: number; feePct: number };
export type CategoryRow = { category: ExpenseCategory; count: number; amount: number; share: number; previous: number; changePct: number | null };
export type StatusRow = { platform: Platform; pendingOrders: number; pending: number; walletOrders: number; wallet: number; bankOrders: number; bank: number; total: number };
export type OwesRow = { asOf: string; mikeHolds: number; saiHolds: number; received: Record<"mike" | "sai", number>; putIn: Record<"mike" | "sai", number>; netProfit: number; owes: Balance["owes"] };
export type CustomerRow = { name: string; platform: Platform; orders: number; gross: number; net: number; lastOrder: string };

export type ReportBundle = {
  period: Period;
  generatedAt: string;
  /** Cash view kept for the settlement and who-owes-whom tables. */
  pl: PLReport;
  /** The one profit: revenue minus cost of units sold minus operating expenses. */
  accrual: AccrualPL;
  cashFlow: CashFlow;
  balanceSheet: BalanceSheet;
  reconciliation: Reconciliation;
  byProduct: ProductRow[];
  byPlatform: PlatformRow[];
  byCategory: CategoryRow[];
  settlement: StatusRow[];
  owesHistory: OwesRow[];
  transfers: ReportTransfer[];
  customers: CustomerRow[];
  inventory: InventoryReports | null;
};

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

const UNKNOWN_CATEGORY: ExpenseCategory = { id: "unknown", name_en: "Uncategorised", name_th: "ไม่ระบุหมวด", sort: 9999, active: false, stock_effect: "none" };

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

export function buildProfitLoss(tx: ReportTx[], categories: ExpenseCategory[], cancelled: { count: number; amount: number } = { count: 0, amount: 0 }): PLReport {
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
    cancelled,
  };
}

export function buildByProduct(tx: ReportTx[], cogsByTransaction: Map<string, number> = new Map()): ProductRow[] {
  return PRODUCT_LINES.map((product) => {
    const income = tx.filter((t) => t.type === "income" && t.product_line === product);
    const units = income.reduce((a, t) => a + t.quantity, 0);
    const net = sum(income.map((t) => t.net_amount));
    const cogs = sum(income.map((t) => cogsByTransaction.get(t.id) ?? 0));
    return {
      product,
      orders: income.length,
      units,
      gross: sum(income.map((t) => t.gross_amount)),
      net,
      cogs,
      grossMargin: round2(net - cogs),
      netPerUnit: units > 0 ? round2(net / units) : 0,
    };
  })
    .filter((r) => r.orders > 0)
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
    const b = whoOwesWhom({ transactions: input.transactions, transfers: input.transfers as TruthTransfer[], cashAdjustments: input.cashAdjustments }, asOf);
    return { asOf, mikeHolds: b.holdings.mike, saiHolds: b.holdings.sai, received: b.received, putIn: b.putIn, netProfit: b.netProfit, owes: b.owes };
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
  const statements = { ...input, products: input.products ?? [], movements: input.movements ?? [] };
  const valuation = valueStock(statements.products, statements.movements);
  return {
    period,
    generatedAt,
    pl: buildProfitLoss(tx, input.categories, (() => { const c = cancellations(input, period); return { count: c.count, amount: c.amount }; })()),
    accrual: buildAccrualPL(statements, period, valueStock(statements.products, statements.movements, { from: period.from, upTo: period.to })),
    cashFlow: buildCashFlow(statements, period),
    balanceSheet: buildBalanceSheet(statements, period.to),
    reconciliation: reconcileProfit(statements, period),
    byProduct: buildByProduct(tx, valuation.cogsByTransaction),
    byPlatform: buildByPlatform(tx),
    byCategory: buildByCategory(tx, prevTx, input.categories),
    settlement: buildSettlement(tx),
    owesHistory: buildOwesHistory(input, period),
    transfers: input.transfers.filter((t) => inPeriod(t.date, period)),
    customers: buildCustomers(tx),
    inventory: input.products
      ? buildInventoryReports(
          {
            products: input.products,
            movements: input.movements ?? [],
            items: input.items ?? [],
            sales: input.transactions.filter((t) => t.type === "income").map((t) => ({ id: t.id, date: t.date, net_amount: t.net_amount })),
            expenses: tx.filter((t) => t.type === "expense").map((t) => ({ id: t.id, category_id: t.category_id, net_amount: t.net_amount })),
            categories: input.categories,
            feePct: input.settings?.find((s) => s.platform === "tiktok")?.commission_pct ?? 0,
          },
          period,
        )
      : null,
  };
}
