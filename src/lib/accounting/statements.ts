import { computeBalance, type BalanceTransaction } from "@/lib/balance";
import type { ExpenseCategory } from "@/lib/categories";
import { valueStock, type Product, type StockMovement, type Valuation } from "@/lib/inventory/valuation";
import { round2 } from "@/lib/money";
import { addDays, inPeriod, type Period } from "@/lib/reports/period";
import type { ReportInput, ReportTx } from "@/lib/reports/build";
import type { Person } from "@/lib/types";

/**
 * One definition of profit, accrual basis:
 *
 *   Profit = Revenue (you received) - Cost of units sold (moving average) - Operating expenses
 *
 * Stock purchases are not expenses: they become inventory. Each expense row
 * contributes cash paid, minus the value of units it brought into stock, plus
 * the cost of units it took out. A stock purchase therefore contributes
 * nothing (its cash became inventory), a bought-and-given sample contributes
 * its cash once, and a sample taken from existing stock contributes the
 * average cost of the unit. Nothing is counted twice, and the balance sheet
 * built from the same movements always balances against this profit.
 */

export type OperatingLine = { category: ExpenseCategory; count: number; cash: number; amount: number };

export type AccrualPL = {
  period: Period;
  orders: number;
  units: number;
  gross: number;
  fees: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  operating: OperatingLine[];
  /** Manual stock corrections and returns in the period, at cost (positive means stock was written down). */
  corrections: number;
  totalOperating: number;
  profit: number;
  /** Cash spent on stock in the period; shown for context, not part of profit. */
  stockPurchasesCash: number;
  /** Cost of sample units that left stock in the period; already inside the Samples operating line. */
  samplesCost: number;
};

export type CashFlow = {
  period: Period;
  /** Order money that reached a bank account in the period (payouts and direct bank transfers). */
  cashIn: number;
  cashInOrders: number;
  /** Every payment made in the period, stock included. */
  cashOut: number;
  stockOut: number;
  operatingOut: number;
  net: number;
  byPerson: Record<Person, { in: number; out: number; net: number }>;
};

export type BalanceSheet = {
  asOf: string;
  cash: Record<Person, number>;
  cashTotal: number;
  /** Order money still with the platforms, at what you receive. */
  receivables: number;
  inventory: number;
  assets: number;
  /** Units already sold or given away that have not been bought yet, at the cost already charged. */
  backlog: number;
  liabilities: number;
  equity: number;
  equityShare: Record<Person, number>;
  /** Cash each partner holds above or below their half of cash profit; the who-owes-whom figure. */
  partnerBalance: Record<Person, number>;
  /** Revenue minus COGS minus operating expenses from the first entry to asOf. Must equal equity. */
  cumulativeProfit: number;
  difference: number;
  balanced: boolean;
};

export type Reconciliation = {
  period: Period;
  profit: number;
  /** Change in inventory net of backlog over the period. */
  inStock: number;
  /** Change in money still with the platforms. */
  pending: number;
  /** Change in cash held by both partners. */
  cash: number;
  difference: number;
  balanced: boolean;
};

export type StatementsInput = ReportInput & { products: Product[]; movements: StockMovement[] };

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
const TOLERANCE = 0.011;

const UNKNOWN_CATEGORY: ExpenseCategory = { id: "unknown", name_en: "Uncategorised", name_th: "ไม่ระบุหมวด", sort: 9999, active: false, stock_effect: "none" };

function movementsUpTo(movements: StockMovement[], asOf: string): StockMovement[] {
  return movements.filter((m) => m.date <= asOf);
}

/** What an expense row costs the business once stock is accounted for: cash paid, minus units brought in, plus units taken out. */
export function operatingCost(row: ReportTx, valuation: Valuation): number {
  const bought = valuation.purchaseByTransaction.get(row.id) ?? 0;
  const given = valuation.sampleCostByTransaction.get(row.id) ?? 0;
  return round2(row.net_amount - bought + given);
}

export function buildAccrualPL(input: StatementsInput, period: Period, valuation?: Valuation): AccrualPL {
  const val = valuation ?? valueStock(input.products, input.movements, { from: period.from, upTo: period.to });
  const tx = input.transactions.filter((t) => inPeriod(t.date, period));
  const income = tx.filter((t) => t.type === "income");
  const expense = tx.filter((t) => t.type === "expense");
  const gross = sum(income.map((t) => t.gross_amount));
  const revenue = sum(income.map((t) => t.net_amount));
  const cogs = sum(income.map((t) => val.cogsByTransaction.get(t.id) ?? 0));
  const known = new Set(input.categories.map((c) => c.id));
  const categories = [...input.categories].sort((a, b) => a.sort - b.sort);
  if (expense.some((t) => !t.category_id || !known.has(t.category_id))) categories.push(UNKNOWN_CATEGORY);

  const operating = categories
    .map((category) => {
      const rows = expense.filter((t) => (category.id === "unknown" ? !t.category_id || !known.has(t.category_id) : t.category_id === category.id));
      return { category, count: rows.length, cash: sum(rows.map((t) => t.net_amount)), amount: sum(rows.map((t) => operatingCost(t, val))) };
    })
    .filter((r) => r.count > 0 && (r.category.stock_effect !== "purchase" || Math.abs(r.amount) >= 0.005));
  const corrections = val.correctionsCost;
  const totalOperating = round2(sum(operating.map((r) => r.amount)) + corrections);
  const stockPurchasesCash = sum(expense.filter((t) => input.categories.find((c) => c.id === t.category_id)?.stock_effect === "purchase").map((t) => t.net_amount));
  const samplesCost = sum(expense.map((t) => val.sampleCostByTransaction.get(t.id) ?? 0));

  return {
    period,
    orders: income.length,
    units: income.reduce((a, t) => a + t.quantity, 0),
    gross,
    fees: round2(gross - revenue),
    revenue,
    cogs,
    grossMargin: round2(revenue - cogs),
    operating,
    corrections,
    totalOperating,
    profit: round2(revenue - cogs - totalOperating),
    stockPurchasesCash,
    samplesCost,
  };
}

function settledOn(t: ReportTx): string | null {
  return t.type === "income" && t.settlement?.status === "received_in_bank" ? (t.settlement.settled_at?.slice(0, 10) ?? t.date) : null;
}

export function buildCashFlow(input: StatementsInput, period: Period): CashFlow {
  const byPerson: CashFlow["byPerson"] = { mike: { in: 0, out: 0, net: 0 }, sai: { in: 0, out: 0, net: 0 } };
  const landed = input.transactions.filter((t) => {
    const d = settledOn(t);
    return d !== null && inPeriod(d, period);
  });
  for (const t of landed) if (t.received_by) byPerson[t.received_by].in = round2(byPerson[t.received_by].in + t.net_amount);
  const paid = input.transactions.filter((t) => t.type === "expense" && inPeriod(t.date, period));
  for (const t of paid) if (t.payer) byPerson[t.payer].out = round2(byPerson[t.payer].out + t.net_amount);
  for (const p of ["mike", "sai"] as const) byPerson[p].net = round2(byPerson[p].in - byPerson[p].out);
  const stockOut = sum(paid.filter((t) => input.categories.find((c) => c.id === t.category_id)?.stock_effect === "purchase").map((t) => t.net_amount));
  const cashIn = sum(landed.map((t) => t.net_amount));
  const cashOut = sum(paid.map((t) => t.net_amount));
  return { period, cashIn, cashInOrders: landed.length, cashOut, stockOut, operatingOut: round2(cashOut - stockOut), net: round2(cashIn - cashOut), byPerson };
}

function balanceTxAsOf(t: ReportTx, asOf: string): BalanceTransaction {
  const settled = settledOn(t);
  return {
    type: t.type,
    platform: t.platform,
    net_amount: t.net_amount,
    payer: t.payer,
    received_by: t.received_by,
    settlement_status: t.type === "income" ? (settled && settled <= asOf ? "received_in_bank" : "pending") : null,
  };
}

/** Everything the business owns and owes at the end of a day, from the first entry onwards. */
export function buildBalanceSheet(input: StatementsInput, asOf: string): BalanceSheet {
  const txs = input.transactions.filter((t) => t.date <= asOf);
  const balance = computeBalance(txs.map((t) => balanceTxAsOf(t, asOf)), input.transfers.filter((t) => t.date <= asOf));
  const receivables = balance.pendingTotal;
  const valuation = valueStock(input.products, movementsUpTo(input.movements, asOf));
  const inventory = valuation.totalValue;
  const backlog = valuation.totalBacklogValue;
  const cashTotal = round2(balance.holdings.mike + balance.holdings.sai);
  const assets = round2(cashTotal + receivables + inventory);
  const liabilities = backlog;
  const equity = round2(assets - liabilities);
  const all: Period = { key: "custom", from: "0000-01-01", to: asOf };
  const pl = buildAccrualPL(input, all, valueStock(input.products, movementsUpTo(input.movements, asOf), { upTo: asOf }));
  const difference = round2(equity - pl.profit);
  return {
    asOf,
    cash: balance.holdings,
    cashTotal,
    receivables,
    inventory,
    assets,
    backlog,
    liabilities,
    equity,
    equityShare: { mike: round2(equity / 2), sai: round2(equity / 2) },
    partnerBalance: balance.delta,
    cumulativeProfit: pl.profit,
    difference,
    balanced: Math.abs(difference) < TOLERANCE,
  };
}

/** Profit this period, split into where it sits: stock, still at the platforms, or cash. */
export function reconcileProfit(input: StatementsInput, period: Period): Reconciliation {
  const opening = buildBalanceSheet(input, addDays(period.from, -1));
  const closing = buildBalanceSheet(input, period.to);
  const profit = buildAccrualPL(input, period).profit;
  const inStock = round2(closing.inventory - closing.backlog - (opening.inventory - opening.backlog));
  const pending = round2(closing.receivables - opening.receivables);
  const cash = round2(closing.cashTotal - opening.cashTotal);
  const difference = round2(profit - inStock - pending - cash);
  return { period, profit, inStock, pending, cash, difference, balanced: Math.abs(difference) < TOLERANCE };
}

export type BookCheck = { key: string; ok: boolean; expected: number; actual: number };

/** The identities every report must satisfy. Empty list of failures means the books are consistent. */
export function checkBooks(input: StatementsInput, asOf: string): { checks: BookCheck[]; ok: boolean } {
  const sheet = buildBalanceSheet(input, asOf);
  const month: Period = { key: "custom", from: asOf.slice(0, 8) + "01", to: asOf };
  const rec = reconcileProfit(input, month);
  const val = valueStock(input.products, movementsUpTo(input.movements, asOf));
  const checks: BookCheck[] = [
    { key: "assets_equal_equity", ok: sheet.balanced, expected: sheet.cumulativeProfit, actual: sheet.equity },
    { key: "book_value_matches", ok: Math.abs(val.totalBookValue - (sheet.inventory - sheet.backlog)) < TOLERANCE, expected: val.totalBookValue, actual: round2(sheet.inventory - sheet.backlog) },
    { key: "profit_reconciles", ok: rec.balanced, expected: rec.profit, actual: round2(rec.inStock + rec.pending + rec.cash) },
  ];
  return { checks, ok: checks.every((c) => c.ok) };
}
