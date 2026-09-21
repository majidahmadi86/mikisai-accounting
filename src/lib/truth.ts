/**
 * One function per number. Every page, card, export and test that shows one
 * of these figures calls the function here; none may compute it on its own.
 * That is what makes two pages disagreeing about the same number impossible.
 *
 * Cancellations live here too: normalizeLedger turns the raw rows into the
 * ledger every other builder reads (cancelled sales out, refunded sales at
 * what is left) plus the cash adjustments that keep who-owes-whom honest
 * about money that arrived and then went back to the platform.
 */
import { buildAccrualPL, buildCashFlow, type AccrualPL, type CashFlow, type StatementsInput } from "@/lib/accounting/statements";
import { computeBalance, type Balance } from "@/lib/balance";
import { fifoBacklog } from "@/lib/inventory/backlog";
import { samplesFromExpenses, type SamplesRow, type TransactionItemRow } from "@/lib/inventory/reports";
import { valueStock, type Product, type StockMovement } from "@/lib/inventory/valuation";
import { round2 } from "@/lib/money";
import { inPeriod, type Period } from "@/lib/reports/period";
import type { ReportTransfer, ReportTx } from "@/lib/reports/build";
import type { Person, TransferKind, TransferReason } from "@/lib/types";

export type TruthTransfer = ReportTransfer & { kind: TransferKind; reason: TransferReason };
export type TruthInput = Omit<StatementsInput, "transfers"> & { items: TransactionItemRow[]; transfers: TruthTransfer[] };

/** A clawback: money already paid out for a sale that was then cancelled or refunded; the next payout offsets it. */
export type ClawbackLite = { id: string; transaction_id: string; amount: number; status: "pending" | "offset"; payout_id: string | null; offset_payout_id: string | null; created_at: string };

export type NormalizedLedger<T extends ReportTx> = {
  /** What every report reads: active sales, refunded sales at what is left, every expense. */
  transactions: T[];
  /** Cancelled and refunded sales as recorded, for lists, the P&L line and Data health. */
  cancelled: T[];
  /** Cash that moved regardless of the sale's fate: money received for a cancelled order, and clawbacks going back. */
  cashAdjustments: ReportTx[];
};

function cashReceivedFor(t: ReportTx): { amount: number; date: string } {
  if (t.type !== "income" || !t.settlement) return { amount: 0, date: t.date };
  const date = t.settlement.settled_at?.slice(0, 10) ?? t.date;
  if (t.settlement.status === "received_in_bank") return { amount: t.net_amount, date };
  return { amount: Math.min(t.net_amount, Math.max(0, t.settlement.paid_amount ?? 0)), date };
}

function cashRow(from: ReportTx, id: string, amount: number, date: string): ReportTx {
  return {
    id,
    type: "income",
    date,
    platform: from.platform,
    product_line: from.product_line,
    gross_amount: 0,
    net_amount: round2(amount),
    quantity: 0,
    payer: null,
    received_by: from.received_by,
    category_id: null,
    customer_name: null,
    note: "",
    order_ref: null,
    created_at: from.created_at,
    settlement: { status: "received_in_bank", settled_at: `${date}T00:00:00Z`, payout_id: null, paid_amount: Math.abs(round2(amount)) },
    synthetic: true,
  };
}

/**
 * The rule for cancelled and refunded sales, applied once so every builder
 * agrees: a cancelled sale leaves the ledger (no revenue, no order, no units);
 * a refunded sale stays at net minus the refund. Money that had already
 * reached the bank still counts as cash (it did arrive) and its clawback
 * takes it out again, pending or offset, so nothing is counted twice.
 */
/** Advance money from TikTok reaching the bank (+) or being taken back after it did (-). Cash, never revenue. */
export type AdvanceCashLite = { id: string; date: string; amount: number; received_by: Person };

/**
 * An early-settlement advance is TikTok's money until the orders behind it
 * settle. When it is withdrawn it is cash in the bank (so who-owes-whom and
 * cash flow must see it), but it is never a sale: it enters here, as a
 * synthetic cash row, and nowhere else.
 */
export function advanceCashRows(cash: AdvanceCashLite[]): ReportTx[] {
  return cash.map((c) => ({
    id: c.id,
    type: "income" as const,
    date: c.date,
    platform: "tiktok" as const,
    product_line: "sugar" as const,
    gross_amount: 0,
    net_amount: round2(c.amount),
    quantity: 0,
    payer: null,
    received_by: c.received_by,
    category_id: null,
    customer_name: null,
    note: "",
    order_ref: null,
    created_at: `${c.date}T00:00:00Z`,
    settlement: { status: "received_in_bank" as const, settled_at: `${c.date}T00:00:00Z`, payout_id: null, paid_amount: Math.abs(round2(c.amount)) },
    synthetic: true,
  }));
}

export function normalizeLedger<T extends ReportTx>(all: T[], clawbacks: ClawbackLite[] = [], advanceCash: AdvanceCashLite[] = []): NormalizedLedger<T> {
  const transactions: T[] = [];
  const cancelled: T[] = [];
  const cashAdjustments: ReportTx[] = [];
  const byId = new Map(all.map((t) => [t.id, t]));
  for (const t of all) {
    const status = t.status ?? "active";
    if (t.type !== "income" || status === "active") {
      transactions.push(t);
      continue;
    }
    cancelled.push(t);
    const cash = cashReceivedFor(t);
    if (status === "cancelled") {
      if (cash.amount > 0) cashAdjustments.push(cashRow(t, `cash:${t.id}`, cash.amount, cash.date));
      continue;
    }
    const refund = Math.min(t.net_amount, Math.max(0, t.refund_amount ?? 0));
    const netLeft = round2(t.net_amount - refund);
    const grossLeft = t.net_amount > 0 ? round2(t.gross_amount - (refund * t.gross_amount) / t.net_amount) : t.gross_amount;
    const paidLeft = t.settlement && t.settlement.status !== "received_in_bank" ? Math.min(netLeft, Math.max(0, t.settlement.paid_amount ?? 0)) : 0;
    transactions.push({ ...t, net_amount: netLeft, gross_amount: grossLeft, settlement: t.settlement ? { ...t.settlement, paid_amount: t.settlement.status === "received_in_bank" ? netLeft : paidLeft } : null });
    // Cash that arrived above what the order is now worth.
    const extra = round2(cash.amount - (t.settlement?.status === "received_in_bank" ? netLeft : paidLeft));
    if (extra > 0) cashAdjustments.push(cashRow(t, `cash:${t.id}`, extra, cash.date));
  }
  for (const c of clawbacks) {
    const order = byId.get(c.transaction_id);
    if (!order) continue;
    cashAdjustments.push(cashRow(order, `claw:${c.id}`, -c.amount, c.created_at.slice(0, 10)));
  }
  cashAdjustments.push(...advanceCashRows(advanceCash));
  return { transactions, cancelled, cashAdjustments };
}

/** Everything up to the end of a day counts; income counts as cash only once it reached a bank account by then. */
function cashTxAsOf(t: ReportTx, asOf: string) {
  const settledOn = t.type === "income" && t.settlement?.status === "received_in_bank" ? (t.settlement.settled_at?.slice(0, 10) ?? t.date) : null;
  const partial = t.type === "income" && t.settlement && t.settlement.status !== "received_in_bank" ? { date: t.settlement.settled_at?.slice(0, 10) ?? t.date, amount: Math.min(t.net_amount, Math.max(0, t.settlement.paid_amount ?? 0)) } : null;
  return {
    type: t.type,
    platform: t.platform,
    net_amount: t.net_amount,
    payer: t.payer,
    received_by: t.received_by,
    settlement_status: t.type === "income" ? ((settledOn && settledOn <= asOf ? "received_in_bank" : "pending") as "received_in_bank" | "pending") : null,
    paid_amount: partial && partial.date <= asOf ? partial.amount : 0,
  };
}

export type WhoOwesWhom = Balance & {
  asOf: string;
  /** Half of every expense paid so far: what each partner should have covered. Display only. */
  fairShareOfCosts: number;
  /** Income received from platforms per partner (no transfers). */
  fromPlatforms: Record<Person, number>;
  /** Transfers received from the other partner. */
  fromPartner: Record<Person, number>;
};

/**
 * The Home banner number, cash basis: income received in bank, minus
 * expenses paid, plus or minus every internal transfer whatever its reason,
 * with cash adjustments for cancelled orders and clawbacks. Home, My
 * Balance, Investment, the Who owes whom report and the Balance sheet all
 * show this and nothing else.
 */
export function whoOwesWhom(input: Pick<TruthInput, "transactions" | "transfers"> & { cashAdjustments?: ReportTx[] }, asOf = "9999-12-31"): WhoOwesWhom {
  const txs = [...input.transactions, ...(input.cashAdjustments ?? [])].filter((t) => t.date <= asOf);
  const transfers = input.transfers.filter((t) => t.date <= asOf);
  const balance = computeBalance(txs.map((t) => cashTxAsOf(t, asOf)), transfers);
  // Synthetic rows never count as waiting orders.
  const synthetic = txs.filter((t) => t.synthetic && t.settlement?.status !== "received_in_bank");
  void synthetic;
  const fromPartner: Record<Person, number> = { mike: 0, sai: 0 };
  for (const tr of transfers) fromPartner[tr.to_person] = round2(fromPartner[tr.to_person] + tr.amount);
  const fromPlatforms: Record<Person, number> = { mike: round2(balance.received.mike - fromPartner.mike), sai: round2(balance.received.sai - fromPartner.sai) };
  return { ...balance, asOf, fairShareOfCosts: round2(balance.expenses / 2), fromPlatforms, fromPartner };
}

export type Contribution = { id: string; date: string; who: Person; kind: "expense" | "transfer"; amount: number; reason: TransferReason | null; category_id: string | null; note: string; transaction_id: string | null; transfer_id: string | null };

/**
 * What a partner put in, for display only: expenses paid directly plus
 * transfers sent for any reason other than paying the other's profit share.
 * Never used to work out who owes whom.
 */
export function contributions(input: Pick<TruthInput, "transactions" | "transfers">, partner: Person, asOf = "9999-12-31"): { total: number; rows: Contribution[] } {
  const rows: Contribution[] = [];
  for (const t of input.transactions) {
    if (t.type === "expense" && t.payer === partner && t.date <= asOf) rows.push({ id: t.id, date: t.date, who: partner, kind: "expense", amount: t.net_amount, reason: null, category_id: t.category_id, note: t.note, transaction_id: t.id, transfer_id: null });
  }
  for (const tr of input.transfers) {
    if (tr.from_person === partner && tr.reason !== "profit_share" && tr.date <= asOf) rows.push({ id: tr.id, date: tr.date, who: partner, kind: "transfer", amount: tr.amount, reason: tr.reason, category_id: null, note: tr.note, transaction_id: null, transfer_id: tr.id });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return { total: round2(rows.reduce((a, r) => a + r.amount, 0)), rows };
}

export type StockPosition = {
  product: Product;
  bought: number;
  sold: number;
  samples: number;
  /** Units that came back from cancelled or refunded orders. */
  returned: number;
  adjustments: number;
  onHand: number;
  backlog: number;
  backlogValue: number;
  avgCost: number;
  value: number;
  lastPurchase: string | null;
  low: boolean;
};

/** Bought, sold, samples, returns, corrections, on hand or backlog, average cost and value per product, from the movements alone. */
export function stockPositions(input: Pick<TruthInput, "products" | "movements">, asOf = "9999-12-31"): StockPosition[] {
  const movements = input.movements.filter((m) => m.date <= asOf);
  const valuation = valueStock(input.products, movements);
  const backlog = fifoBacklog(movements);
  return valuation.products.map((r) => {
    const mine = movements.filter((m) => m.product_id === r.product.id);
    const purchases = mine.filter((m) => m.kind === "purchase");
    return {
      product: r.product,
      bought: purchases.reduce((a, m) => a + m.qty, 0),
      sold: mine.filter((m) => m.kind === "sale").reduce((a, m) => a - m.qty, 0),
      samples: mine.filter((m) => m.kind === "sample").reduce((a, m) => a - m.qty, 0),
      returned: mine.filter((m) => m.kind === "return" && m.qty > 0).reduce((a, m) => a + m.qty, 0),
      adjustments: mine.filter((m) => m.kind === "adjustment" || (m.kind === "return" && m.qty < 0)).reduce((a, m) => a + m.qty, 0),
      onHand: Math.max(0, r.onHand),
      backlog: backlog.get(r.product.id)?.backlog ?? r.backlog,
      backlogValue: r.backlogValue,
      avgCost: r.avgCost,
      value: r.value,
      lastPurchase: purchases.map((m) => m.date).sort().pop() ?? null,
      low: r.low,
    };
  });
}

export function stockPosition(input: Pick<TruthInput, "products" | "movements">, productId: string, asOf?: string): StockPosition | null {
  return stockPositions(input, asOf).find((p) => p.product.id === productId) ?? null;
}

/** Stock on hand at cost, the Balance sheet inventory line. */
export function inventoryValue(input: Pick<TruthInput, "products" | "movements">, asOf?: string): number {
  return round2(stockPositions(input, asOf).reduce((a, p) => a + p.value, 0));
}

export function profitAndLoss(input: StatementsInput, period: Period): AccrualPL {
  return buildAccrualPL(input, period, valueStock(input.products, input.movements, { from: period.from, upTo: period.to }));
}

export function cashFlow(input: StatementsInput, period: Period): CashFlow {
  return buildCashFlow(input, period);
}

/** Samples given in the period, at what each row cost the business: the same number the profit and loss charges. */
export function samplesGiven(input: TruthInput, period: Period): { rows: SamplesRow[]; total: number } {
  const valuation = valueStock(input.products, input.movements, { from: period.from, upTo: period.to });
  const expenses = input.transactions.filter((t) => t.type === "expense" && inPeriod(t.date, period)).map((t) => ({ id: t.id, category_id: t.category_id, net_amount: t.net_amount }));
  return samplesFromExpenses(expenses, input.categories, input.items, input.products, valuation);
}

export type Cancellations = { count: number; cancelled: number; refunded: number; amount: number; unitsReturned: number };

/** Cancelled and refunded sales in the period (by the day they were marked), the money taken back and the units that came back. */
export function cancellations(input: { cancelled?: ReportTx[]; movements?: StockMovement[] }, period: Period): Cancellations {
  const rows = (input.cancelled ?? []).filter((t) => inPeriod(t.status_date ?? t.date, period));
  const ids = new Set(rows.map((t) => t.id));
  const unitsReturned = (input.movements ?? []).filter((m) => m.kind === "return" && m.qty > 0 && m.transaction_id && ids.has(m.transaction_id) && inPeriod(m.date, period)).reduce((a, m) => a + m.qty, 0);
  return {
    count: rows.length,
    cancelled: rows.filter((t) => t.status === "cancelled").length,
    refunded: rows.filter((t) => t.status === "refunded").length,
    amount: round2(rows.reduce((a, t) => a + Math.min(t.net_amount, Math.max(0, t.refund_amount ?? 0)), 0)),
    unitsReturned,
  };
}

/** Money paid out for orders since cancelled or refunded that the platform has not yet taken back. */
export function clawbackPending(input: { clawbacks?: ClawbackLite[] }, platform?: string, orders?: ReportTx[]): number {
  const byId = orders ? new Map(orders.map((t) => [t.id, t])) : null;
  return round2((input.clawbacks ?? []).filter((c) => c.status === "pending" && (!platform || !byId || byId.get(c.transaction_id)?.platform === platform)).reduce((a, c) => a + c.amount, 0));
}
