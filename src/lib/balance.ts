import { round2 } from "./money";
import type { Person, Platform, SettlementStatus } from "./types";

export type BalanceTransaction = {
  type: "income" | "expense";
  platform: Platform;
  net_amount: number;
  payer: Person | null;
  received_by: Person | null;
  settlement_status: SettlementStatus | null;
  /** Part of a pending order already paid out (early payout). */
  paid_amount?: number;
};

export type BalanceTransfer = {
  from_person: Person;
  to_person: Person;
  amount: number;
};

export type Balance = {
  settledIncome: number;
  expenses: number;
  netProfit: number;
  target: number;
  holdings: Record<Person, number>;
  /** Money that reached this person: payouts and transfers received. */
  received: Record<Person, number>;
  /** Money this person paid out: expenses and transfers sent. */
  putIn: Record<Person, number>;
  delta: Record<Person, number>;
  owes: { from: Person; to: Person; amount: number } | null;
  pendingByPlatform: Record<Platform, { pending: number; settled_not_withdrawn: number; total: number; orders: number }>;
  pendingTotal: number;
};

const EMPTY_PLATFORM = () => ({ pending: 0, settled_not_withdrawn: 0, total: 0, orders: 0 });

/**
 * Who owes whom. Only income whose settlement is received_in_bank counts.
 *
 *   holdings[p] = income received in bank by p
 *               - expenses paid by p
 *               + transfers received by p
 *               - transfers sent by p
 *   netProfit   = all received income - all expenses
 *   target      = netProfit / 2
 *   delta[p]    = holdings[p] - target
 *
 * A positive delta means that person holds more than their share and owes the other.
 */
export function computeBalance(transactions: BalanceTransaction[], transfers: BalanceTransfer[]): Balance {
  const holdings: Record<Person, number> = { mike: 0, sai: 0 };
  const received: Record<Person, number> = { mike: 0, sai: 0 };
  const putIn: Record<Person, number> = { mike: 0, sai: 0 };
  let settledIncome = 0;
  let expenses = 0;
  const pendingByPlatform: Balance["pendingByPlatform"] = {
    tiktok: EMPTY_PLATFORM(),
    shopee: EMPTY_PLATFORM(),
    fb: EMPTY_PLATFORM(),
    other: EMPTY_PLATFORM(),
  };

  for (const tx of transactions) {
    if (tx.type === "income") {
      if (tx.settlement_status === "received_in_bank") {
        settledIncome += tx.net_amount;
        if (tx.received_by) {
          holdings[tx.received_by] += tx.net_amount;
          received[tx.received_by] += tx.net_amount;
        }
      } else {
        // An early payout puts part of the order in the bank; the rest stays with the platform.
        const paid = Math.min(tx.net_amount, Math.max(0, tx.paid_amount ?? 0));
        const rest = tx.net_amount - paid;
        if (paid > 0) {
          settledIncome += paid;
          if (tx.received_by) {
            holdings[tx.received_by] += paid;
            received[tx.received_by] += paid;
          }
        }
        const bucket = pendingByPlatform[tx.platform];
        const key = tx.settlement_status === "settled_not_withdrawn" ? "settled_not_withdrawn" : "pending";
        bucket[key] += rest;
        bucket.total += rest;
        bucket.orders += 1;
      }
    } else {
      expenses += tx.net_amount;
      if (tx.payer) {
        holdings[tx.payer] -= tx.net_amount;
        putIn[tx.payer] += tx.net_amount;
      }
    }
  }

  for (const tr of transfers) {
    holdings[tr.from_person] -= tr.amount;
    holdings[tr.to_person] += tr.amount;
    putIn[tr.from_person] += tr.amount;
    received[tr.to_person] += tr.amount;
  }

  const netProfit = settledIncome - expenses;
  const target = netProfit / 2;
  // Rounded once: the two sides are always exact opposites, so every page names the same amount to the satang.
  const mikeDelta = round2(holdings.mike - target);
  const delta: Record<Person, number> = { mike: mikeDelta, sai: mikeDelta === 0 ? 0 : -mikeDelta };

  let owes: Balance["owes"] = null;
  if (Math.abs(delta.mike) >= 1) {
    owes = delta.mike > 0 ? { from: "mike", to: "sai", amount: delta.mike } : { from: "sai", to: "mike", amount: delta.sai };
  }

  return {
    settledIncome: round2(settledIncome),
    expenses: round2(expenses),
    netProfit: round2(netProfit),
    target: round2(target),
    holdings: { mike: round2(holdings.mike), sai: round2(holdings.sai) },
    received: { mike: round2(received.mike), sai: round2(received.sai) },
    putIn: { mike: round2(putIn.mike), sai: round2(putIn.sai) },
    delta,
    owes,
    pendingByPlatform,
    pendingTotal: round2(Object.values(pendingByPlatform).reduce((sum, p) => sum + p.total, 0)),
  };
}
