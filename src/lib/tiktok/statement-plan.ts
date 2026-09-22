/**
 * What one Finance statement will do to the ledger, decided without touching
 * the database. Everything already known (by order number and kind, by wallet
 * reference, by payout reference) is left alone, so dropping the same file
 * twice changes nothing.
 */
import { round2 } from "@/lib/money";
import type { Person } from "@/lib/types";
import { isOverweight, unitsOf, type SkuEntry, type Statement, type StatementRow } from "./statement";
import { walletState, type ReturnLoss, type SettledOrder, type UnsettledOrder, type WalletEvent, type WalletState } from "./wallet";

export const NET_TOLERANCE = 1;

export type LedgerOrder = { id: string; order_ref: string; date: string; net_amount: number; status: "active" | "cancelled" | "refunded"; settlement_status: "pending" | "settled_not_withdrawn" | "received_in_bank" | null };

export type StatementFacts = {
  order_ref: string;
  kind: "order" | "refund";
  transaction_id: string | null;
  created_date: string | null;
  settled_date: string | null;
  settlement_amount: number;
  revenue: number;
  fee_commission: number;
  fee_commerce_growth: number;
  fee_transaction: number;
  fee_seller_shipping: number;
  platform_discount: number;
  chargeable_weight_g: number | null;
  boxes: number;
  overweight: boolean;
  pre_business: boolean;
  qty_inferred: boolean;
  ledger_net_before: number | null;
};

export type NewOrder = { order_ref: string; date: string; gross_amount: number; net_amount: number; product_id: string; quantity: number; qty_inferred: boolean; settled_date: string | null };

export type StatementPlan = {
  period: { from: string; to: string } | null;
  /** Orders the statement settles that are already in the ledger: real net, settled day, "Paid by TikTok, still in wallet". */
  settle: { transaction_id: string; order_ref: string; net: number; settled_date: string | null; from_pending: boolean }[];
  /** Ledger net differs from the statement by more than one baht: corrected to the statement. */
  netFixes: { transaction_id: string; order_ref: string; old: number; new: number }[];
  /** Settled orders from on or after the business start that the ledger does not have yet. */
  create: NewOrder[];
  /** Rows that cannot be created yet: the app does not know the product behind a TikTok listing, or how many boxes. */
  needsProduct: { order_ref: string; skus: string[]; revenue: number }[];
  /** Returns: mark the order refunded and record the loss as a Return cost expense. */
  refunds: { transaction_id: string | null; order_ref: string; date: string; loss: number }[];
  facts: StatementFacts[];
  walletEvents: (WalletEvent & { status: string })[];
  preBusiness: { count: number; total: number };
  overweight: { order_ref: string; chargeable_weight_g: number; boxes: number; net: number }[];
  /** The wallet replayed over everything known plus this file. */
  wallet: WalletState;
  /** Withdrawals that are not payouts yet. */
  payouts: WalletState["withdrawals"];
  alreadyKnown: number;
};

export type StatementPlanInput = {
  statement: Statement;
  startDate: string;
  receivedBy: Person;
  skus: Map<string, SkuEntry>;
  /** The product a row stands for when TikTok gave no item details: the one the known listings sell. */
  fallbackProductId: string | null;
  ledger: Map<string, LedgerOrder>;
  /** "order_ref:kind" of every statement row already stored. */
  knownFacts: Set<string>;
  /** Stored history, so the wallet replays from the beginning and not only from this file. */
  history: { settled: SettledOrder[]; losses: ReturnLoss[]; events: WalletEvent[] };
  /** Payout references already recorded. */
  knownPayouts: Set<string>;
  /** Business orders TikTok has not settled yet, for the advance estimate. */
  unsettled: UnsettledOrder[];
};

const factsOf = (r: StatementRow, kind: "order" | "refund", extra: Pick<StatementFacts, "transaction_id" | "boxes" | "overweight" | "pre_business" | "qty_inferred" | "ledger_net_before">): StatementFacts => ({
  order_ref: kind === "refund" ? (r.related_order_id ?? r.id) : r.id,
  kind,
  created_date: r.created,
  settled_date: r.settled,
  settlement_amount: r.settlement,
  revenue: r.revenue,
  fee_commission: r.fee_commission,
  fee_commerce_growth: r.fee_commerce_growth,
  fee_transaction: r.fee_transaction,
  fee_seller_shipping: r.fee_seller_shipping,
  platform_discount: r.platform_discount,
  chargeable_weight_g: r.chargeable_weight_g,
  ...extra,
});

export function planStatement(input: StatementPlanInput): StatementPlan {
  const plan: StatementPlan = { period: input.statement.period, settle: [], netFixes: [], create: [], needsProduct: [], refunds: [], facts: [], walletEvents: [], preBusiness: { count: 0, total: 0 }, overweight: [], wallet: walletState({ settled: [], losses: [], events: [], unsettled: [] }), payouts: [], alreadyKnown: 0 };
  const settled = [...input.history.settled];
  const losses = [...input.history.losses];
  const events = [...input.history.events];
  const knownEvents = new Set(events.map((e) => `${e.kind}:${e.reference}`));
  const settledNow = new Set<string>();
  const seen = new Set<string>();

  for (const r of input.statement.rows) {
    if (r.type === "other") continue;
    if (r.type === "advance_disbursement" || r.type === "advance_recovery") {
      const key = `${r.type}:${r.id}`;
      if (knownEvents.has(key)) {
        plan.alreadyKnown += 1;
        continue;
      }
      knownEvents.add(key);
      const amount = r.adjustment !== 0 ? r.adjustment : r.settlement;
      const e = { kind: r.type, reference: r.id, date: r.settled ?? r.created ?? input.statement.period?.to ?? "", amount, received_by: input.receivedBy, status: "" } as const;
      if (!e.date) continue;
      events.push(e);
      plan.walletEvents.push(e);
      continue;
    }

    const kind = r.type === "refund" ? "refund" : "order";
    const ref = kind === "refund" ? (r.related_order_id ?? r.id) : r.id;
    const key = `${ref}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (input.knownFacts.has(key)) {
      plan.alreadyKnown += 1;
      continue;
    }
    const pre = Boolean(r.created && r.created < input.startDate);
    const units = unitsOf(r, input.skus, input.fallbackProductId);
    const boxes = units.boxes ?? 1;
    const ledger = input.ledger.get(ref) ?? null;
    const date = r.settled ?? r.created ?? "";

    if (kind === "refund") {
      const loss = Math.abs(Math.min(0, r.settlement));
      plan.facts.push(factsOf(r, "refund", { transaction_id: ledger?.id ?? null, boxes, overweight: false, pre_business: pre, qty_inferred: units.inferred, ledger_net_before: null }));
      if (pre) {
        plan.preBusiness.count += 1;
        plan.preBusiness.total = round2(plan.preBusiness.total + r.settlement);
        if (date && loss > 0) settled.push({ order_ref: `refund:${ref}`, date, net: 0, business: false });
        continue;
      }
      if (date && loss > 0) losses.push({ order_ref: ref, date, loss });
      plan.refunds.push({ transaction_id: ledger?.id ?? null, order_ref: ref, date: date || input.startDate, loss });
      continue;
    }

    const heavy = isOverweight(r.chargeable_weight_g, units.boxes);
    if (pre) {
      plan.preBusiness.count += 1;
      plan.preBusiness.total = round2(plan.preBusiness.total + r.settlement);
      plan.facts.push(factsOf(r, "order", { transaction_id: null, boxes, overweight: heavy, pre_business: true, qty_inferred: units.inferred, ledger_net_before: null }));
      if (date) settled.push({ order_ref: ref, date, net: r.settlement, business: false });
      continue;
    }

    if (ledger) {
      const differs = Math.abs(ledger.net_amount - r.settlement) > NET_TOLERANCE;
      if (differs) plan.netFixes.push({ transaction_id: ledger.id, order_ref: ref, old: ledger.net_amount, new: r.settlement });
      plan.settle.push({ transaction_id: ledger.id, order_ref: ref, net: r.settlement, settled_date: r.settled, from_pending: ledger.settlement_status === "pending" || ledger.settlement_status === null });
      plan.facts.push(factsOf(r, "order", { transaction_id: ledger.id, boxes, overweight: heavy, pre_business: false, qty_inferred: units.inferred, ledger_net_before: differs ? ledger.net_amount : null }));
    } else if (!units.product_id || units.boxes == null) {
      plan.needsProduct.push({ order_ref: ref, skus: units.unknown_skus, revenue: r.revenue });
      continue;
    } else {
      plan.create.push({ order_ref: ref, date: r.created ?? date, gross_amount: r.revenue > 0 ? r.revenue : r.settlement, net_amount: r.settlement, product_id: units.product_id, quantity: units.boxes, qty_inferred: units.inferred, settled_date: r.settled });
      plan.facts.push(factsOf(r, "order", { transaction_id: null, boxes, overweight: heavy, pre_business: false, qty_inferred: units.inferred, ledger_net_before: null }));
    }
    if (heavy) plan.overweight.push({ order_ref: ref, chargeable_weight_g: r.chargeable_weight_g as number, boxes, net: r.settlement });
    if (date) settled.push({ order_ref: ref, date, net: r.settlement, business: true });
    settledNow.add(ref);
  }

  // The wallet sheet: earnings and withdrawals. "/" rows mirror the early-settlement rows above and are only kept when Order details did not carry them.
  // A wallet mirror row repeats an advance row of Order details. Disbursements
  // share the reference; recoveries do not (the wallet shows its own id), so a
  // mirror also matches an advance of the same day and amount, each used once.
  const advanceRows = input.statement.rows
    .filter((r) => r.type === "advance_disbursement" || r.type === "advance_recovery")
    .map((r) => ({ date: r.settled ?? r.created ?? "", amount: r.adjustment !== 0 ? r.adjustment : r.settlement, used: false }));
  for (const w of input.statement.wallet) {
    const date = w.success ?? w.requested ?? "";
    if (!date) continue;
    let kind: WalletEvent["kind"];
    if (w.kind === "earnings") kind = "earnings";
    else if (w.kind === "withdrawal") kind = "withdrawal";
    else {
      const twin = advanceRows.find((a) => !a.used && a.date === date && Math.abs(a.amount - w.amount) < 0.01);
      if (twin) twin.used = true;
      if (twin || knownEvents.has(`advance_disbursement:${w.reference}`) || knownEvents.has(`advance_recovery:${w.reference}`)) continue;
      kind = w.amount >= 0 ? "advance_disbursement" : "advance_recovery";
    }
    if (kind === "withdrawal" && !/success|complete|paid|transferred|โอนแล้ว|สำเร็จ/i.test(w.status || "success")) continue;
    const key = `${kind}:${w.reference}`;
    if (knownEvents.has(key)) {
      plan.alreadyKnown += 1;
      continue;
    }
    knownEvents.add(key);
    const e = { kind, reference: w.reference, date, amount: w.amount, bank_suffix: w.bank.replace(/\D/g, "").slice(-4), received_by: input.receivedBy, status: w.status, mirror: w.kind === "mirror" };
    events.push(e);
    plan.walletEvents.push(e);
  }

  plan.wallet = walletState({ settled, losses, events, unsettled: input.unsettled.filter((o) => !settledNow.has(o.order_ref)), defaultReceiver: input.receivedBy });
  plan.payouts = plan.wallet.withdrawals.filter((w) => !input.knownPayouts.has(w.reference));
  return plan;
}

/** True when a plan would change nothing: every row, wallet line and payout is already known. */
export function planIsEmpty(p: StatementPlan): boolean {
  return !p.settle.length && !p.netFixes.length && !p.create.length && !p.refunds.length && !p.facts.length && !p.walletEvents.length && !p.payouts.length;
}
