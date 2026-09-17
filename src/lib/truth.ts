/**
 * One function per number. Every page, card, export and test that shows one
 * of these figures calls the function here; none may compute it on its own.
 * That is what makes two pages disagreeing about the same number impossible.
 */
import { buildAccrualPL, buildCashFlow, type AccrualPL, type CashFlow, type StatementsInput } from "@/lib/accounting/statements";
import { computeBalance, type Balance } from "@/lib/balance";
import { fifoBacklog } from "@/lib/inventory/backlog";
import { samplesFromExpenses, type SamplesRow, type TransactionItemRow } from "@/lib/inventory/reports";
import { valueStock, type Product } from "@/lib/inventory/valuation";
import { round2 } from "@/lib/money";
import { inPeriod, type Period } from "@/lib/reports/period";
import type { ReportTransfer, ReportTx } from "@/lib/reports/build";
import type { Person, TransferKind, TransferReason } from "@/lib/types";

export type TruthTransfer = ReportTransfer & { kind: TransferKind; reason: TransferReason };
export type TruthInput = Omit<StatementsInput, "transfers"> & { items: TransactionItemRow[]; transfers: TruthTransfer[] };

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
 * expenses paid, plus or minus every internal transfer whatever its reason.
 * Home, My Balance, Investment, the Who owes whom report and the Balance
 * sheet all show this and nothing else.
 */
export function whoOwesWhom(input: Pick<TruthInput, "transactions" | "transfers">, asOf = "9999-12-31"): WhoOwesWhom {
  const txs = input.transactions.filter((t) => t.date <= asOf);
  const transfers = input.transfers.filter((t) => t.date <= asOf);
  const balance = computeBalance(txs.map((t) => cashTxAsOf(t, asOf)), transfers);
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
  adjustments: number;
  onHand: number;
  backlog: number;
  backlogValue: number;
  avgCost: number;
  value: number;
  lastPurchase: string | null;
  low: boolean;
};

/** Bought, sold, samples, corrections, on hand or backlog, average cost and value per product, from the movements alone. */
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
      adjustments: mine.filter((m) => m.kind === "adjustment" || m.kind === "return").reduce((a, m) => a + m.qty, 0),
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
