/**
 * The TikTok wallet, replayed from the statement. Pure: rows in, facts out.
 *
 * Settled orders land in the wallet. A withdrawal moves wallet money to the
 * bank and pays the oldest settled orders first, up to what was withdrawn.
 * An early-settlement disbursement is an advance from TikTok: a liability,
 * never income. It can be withdrawn like any wallet money (so cash in the
 * bank includes it) and TikTok takes it back out of later settlements (a
 * recovery). Profit never sees any of it.
 */
import { round2 } from "@/lib/money";
import type { Person } from "@/lib/types";

export type SettledOrder = { order_ref: string; date: string; net: number; business: boolean };
export type ReturnLoss = { order_ref: string; date: string; loss: number };
export type WalletEvent = { kind: "earnings" | "withdrawal" | "advance_disbursement" | "advance_recovery"; reference: string; date: string; amount: number; bank_suffix?: string; received_by?: Person; /** An advance read from Withdrawal records (it has a status): the copy of an Order details row. */ mirror?: boolean };

/**
 * TikTok lists every advance twice: in Order details and again in Withdrawal
 * records, where a recovery carries its own reference. Up to v3.1 both were
 * stored, so recoveries counted double. A mirror that has an Order details
 * twin (same kind, day and amount) is dropped, each twin used once.
 */
export function withoutMirrorTwins(events: WalletEvent[]): WalletEvent[] {
  const originals = events.filter((e) => !e.mirror && e.kind.startsWith("advance")).map((e) => ({ e, used: false }));
  return events.filter((e) => {
    if (!e.mirror) return true;
    const twin = originals.find((o) => !o.used && o.e.kind === e.kind && o.e.date === e.date && Math.abs(o.e.amount - e.amount) < 0.01);
    if (!twin) return true;
    twin.used = true;
    return false;
  });
}
export type UnsettledOrder = { order_ref: string; date: string; value: number };

export type WithdrawalResult = {
  reference: string;
  date: string;
  amount: number;
  bank_suffix: string;
  received_by: Person;
  /** Business orders this withdrawal brought to the bank, oldest first, each at what TikTok paid for it. */
  orders: { order_ref: string; amount: number }[];
  /** Advance money carried to the bank by this withdrawal. */
  advance: number;
  /** Whatever is neither a business order nor an advance: orders from before the business began, or money the statement does not explain. */
  other: number;
};

export type AdvanceCash = { id: string; date: string; amount: number; received_by: Person };
export type AdvanceAllocation = { order_ref: string; date: string; amount: number };

export type WalletState = {
  /** Disbursements minus recoveries: what TikTok will still take back. */
  advanceBalance: number;
  disbursed: number;
  recovered: number;
  withdrawals: WithdrawalResult[];
  /** Advance money reaching the bank (+) and being taken back after it did (-): cash, never revenue. */
  advanceCash: AdvanceCash[];
  /** The balance spread over unsettled business orders at 70% of each, oldest first: an estimate until they settle. */
  allocations: AdvanceAllocation[];
  /** Advance left over once every unsettled business order has its 70%: it belongs to orders from before the business. */
  advancePreBusiness: number;
  /** Earnings days whose amount differs from that day's order rows and recoveries by more than one baht. */
  earningsMismatch: { date: string; stated: number; rows: number }[];
};

export const ADVANCE_SHARE = 0.7;
const TOLERANCE = 1;
const ORDER: Record<string, number> = { settle: 0, loss: 1, advance_recovery: 2, advance_disbursement: 3, earnings: 4, withdrawal: 5 };

type Step =
  | { t: "settle"; date: string; o: SettledOrder }
  | { t: "loss"; date: string; l: ReturnLoss }
  | { t: "advance_disbursement" | "advance_recovery" | "earnings" | "withdrawal"; date: string; e: WalletEvent };

export function walletState(input: { settled: SettledOrder[]; losses: ReturnLoss[]; events: WalletEvent[]; unsettled: UnsettledOrder[]; defaultReceiver?: Person }): WalletState {
  const receiver = input.defaultReceiver ?? "sai";
  const steps: Step[] = [
    ...input.settled.map((o): Step => ({ t: "settle", date: o.date, o })),
    ...input.losses.map((l): Step => ({ t: "loss", date: l.date, l })),
    ...withoutMirrorTwins(input.events).map((e): Step => ({ t: e.kind, date: e.date, e })),
  ].sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.t] - ORDER[b.t]);

  const queue: SettledOrder[] = [];
  let advanceInWallet = 0;
  let advanceInBank = 0;
  let disbursed = 0;
  let recovered = 0;
  /** Order money that left the wallet before a withdrawal could carry it: return losses, and recoveries of advance already banked. */
  let diverted = 0;
  const withdrawals: WithdrawalResult[] = [];
  const advanceCash: AdvanceCash[] = [];
  const perDay = new Map<string, number>();
  const stated: { date: string; amount: number }[] = [];
  const bump = (date: string, amount: number) => perDay.set(date, round2((perDay.get(date) ?? 0) + amount));

  for (const s of steps) {
    if (s.t === "settle") {
      queue.push(s.o);
      bump(s.date, s.o.net);
    } else if (s.t === "loss") {
      diverted = round2(diverted + s.l.loss);
      bump(s.date, -s.l.loss);
    } else if (s.t === "advance_disbursement") {
      const a = Math.abs(s.e.amount);
      advanceInWallet = round2(advanceInWallet + a);
      disbursed = round2(disbursed + a);
    } else if (s.t === "advance_recovery") {
      const r = Math.abs(s.e.amount);
      recovered = round2(recovered + r);
      bump(s.date, -r);
      const fromWallet = Math.min(r, advanceInWallet);
      advanceInWallet = round2(advanceInWallet - fromWallet);
      const fromBank = Math.min(round2(r - fromWallet), advanceInBank);
      if (fromBank > 0) {
        // The advance was already in the bank: it now stands for the orders that just settled, so it stops being an advance.
        advanceInBank = round2(advanceInBank - fromBank);
        diverted = round2(diverted + fromBank);
        advanceCash.push({ id: `advance:${s.e.reference}`, date: s.date, amount: -fromBank, received_by: s.e.received_by ?? receiver });
      }
    } else if (s.t === "earnings") {
      stated.push({ date: s.date, amount: s.e.amount });
    } else {
      const amount = Math.abs(s.e.amount);
      let budget = round2(amount + diverted);
      const orders: { order_ref: string; amount: number }[] = [];
      let paidOrders = 0;
      while (queue.length && queue[0].net <= budget + TOLERANCE) {
        const o = queue.shift()!;
        budget = round2(budget - o.net);
        paidOrders = round2(paidOrders + o.net);
        if (o.business) orders.push({ order_ref: o.order_ref, amount: o.net });
      }
      diverted = Math.max(0, round2(diverted - Math.max(0, round2(paidOrders - amount))));
      const left = Math.max(0, budget);
      const advance = Math.min(left, advanceInWallet);
      if (advance > 0) {
        advanceInWallet = round2(advanceInWallet - advance);
        advanceInBank = round2(advanceInBank + advance);
        advanceCash.push({ id: `advance:${s.e.reference}`, date: s.date, amount: advance, received_by: s.e.received_by ?? receiver });
      }
      const business = orders.reduce((a, o) => a + o.amount, 0);
      withdrawals.push({ reference: s.e.reference, date: s.date, amount, bank_suffix: s.e.bank_suffix ?? "", received_by: s.e.received_by ?? receiver, orders, advance: round2(advance), other: Math.max(0, round2(amount - business - advance)) });
    }
  }

  const advanceBalance = round2(disbursed - recovered);
  let pool = Math.max(0, advanceBalance);
  const allocations: AdvanceAllocation[] = [];
  for (const o of [...input.unsettled].sort((a, b) => a.date.localeCompare(b.date) || a.order_ref.localeCompare(b.order_ref))) {
    if (pool <= 0) break;
    const share = Math.min(pool, round2(o.value * ADVANCE_SHARE));
    if (share <= 0) continue;
    allocations.push({ order_ref: o.order_ref, date: o.date, amount: share });
    pool = round2(pool - share);
  }

  const earningsMismatch = stated.filter((e) => Math.abs(e.amount - (perDay.get(e.date) ?? 0)) > TOLERANCE).map((e) => ({ date: e.date, stated: e.amount, rows: perDay.get(e.date) ?? 0 }));
  return { advanceBalance, disbursed, recovered, withdrawals, advanceCash, allocations, advancePreBusiness: round2(pool), earningsMismatch };
}
