/**
 * This week, Monday to Sunday: what sold, what TikTok will pay, what was
 * bought, the profit to expect, who holds the cash, and what to buy. Pure:
 * the ledger snapshot in, one report out. Cash comes from truth.whoOwesWhom
 * with the same inputs Home and My Balance use, so the three always agree.
 */
import type { ExpenseCategory } from "@/lib/categories";
import { categoryLabel } from "@/lib/categories";
import { fifoBacklog } from "@/lib/inventory/backlog";
import { bufferFor, salePriceFor } from "@/lib/inventory/product-stats";
import { valueStock, type Product, type StockMovement } from "@/lib/inventory/valuation";
import { round2 } from "@/lib/money";
import { addDays, thisWeek, type Period } from "@/lib/reports/period";
import type { ReportTx } from "@/lib/reports/build";
import { stillToCome, whoOwesWhom, type TruthTransfer, type WhoOwesWhom } from "@/lib/truth";
import type { Person } from "@/lib/types";

export { thisWeek };

/**
 * The seven days the page shows. With no day chosen, the week Monday to
 * Sunday that holds today. A chosen day starts the week, so a week can line
 * up with TikTok's statement (15 to 21 September runs Tuesday to Monday).
 */
export function weekOf(from: string | null | undefined, today: string): Period {
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) return { key: "week", from, to: addDays(from, 6) };
  return thisWeek(today);
}

export type WeekFact = { order_ref: string; kind: "order" | "refund"; transaction_id: string | null; settlement_amount: number; revenue: number; boxes: number; fee_transaction: number; fee_commission: number; fee_commerce_growth: number; fee_seller_shipping: number; pre_business: boolean };

export type WeekInput = {
  transactions: ReportTx[];
  cancelled: ReportTx[];
  cashAdjustments: ReportTx[];
  transfers: TruthTransfer[];
  items: { transaction_id: string; product_id: string; qty: number; unit_cost: number | null }[];
  products: Product[];
  movements: StockMovement[];
  categories: ExpenseCategory[];
  facts: WeekFact[];
  /** The TikTok advance spread over unsettled orders, 70% each: from v3.1. */
  allocations: { order_ref: string; amount: number }[];
};

export type VariantLine = { product_id: string; name: string; unit: string; qty: number };

export type WeekReport = {
  period: Period;
  sold: { orders: number; variants: VariantLine[]; cancelledBeforeShipping: number };
  tiktok: { expected: number; settled: number; advanced: number; stillToCome: number; estimatedOrders: number };
  bought: { variants: VariantLine[]; amount: number; byPerson: Record<Person, number>; other: { label: string; amount: number }[]; otherTotal: number };
  profit: { expectedIncome: number; costOfUnits: number; otherCosts: number; expected: number };
  cash: {
    holdings: Record<Person, number>;
    owes: WhoOwesWhom["owes"];
    /** Each side, for transparency: what they paid out (costs and transfers sent) and what reached them (platforms, advance included, and transfers). */
    paid: Record<Person, number>;
    received: Record<Person, number>;
    advanced: Record<Person, number>;
    /** The reason the one transfer is recorded with, never asked. */
    reason: "profit_share" | "my_half_of_costs";
  };
  buy: { product_id: string; name: string; unit: string; backlog: number; buffer: number; toBuy: number }[];
};

/** TikTok's cut on a sale, as the statements show it: transaction fee, commission and the commerce growth fee, as shares of revenue. */
export type FeeRule = { transaction: number; commission: number; growth: number };
export const DEFAULT_FEES: FeeRule = { transaction: 0.0337, commission: 0.107, growth: 0.0803 };

/** The fee shares seen on real statement rows; the defaults until there are any. */
export function feeRule(facts: WeekFact[]): FeeRule {
  const rows = facts.filter((f) => f.kind === "order" && f.revenue > 0);
  const revenue = rows.reduce((a, f) => a + f.revenue, 0);
  if (revenue <= 0) return DEFAULT_FEES;
  const share = (pick: (f: WeekFact) => number) => rows.reduce((a, f) => a + Math.abs(pick(f)), 0) / revenue;
  return { transaction: share((f) => f.fee_transaction), commission: share((f) => f.fee_commission), growth: share((f) => f.fee_commerce_growth) };
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * What TikTok will pay for one order, by the rules the statements show, in
 * this order: what it actually paid; else what it paid for the same product,
 * units and price before; else what it paid for the same units and price;
 * else revenue less the fee shares and shipping (1 baht plus 2 per box).
 */
export function expectedSettlement(order: { product_id: string | null; boxes: number; revenue: number; actual: number | null }, observed: { byProduct: Map<string, number[]>; byShape: Map<string, number[]> }, fees: FeeRule): { amount: number; estimated: boolean } {
  if (order.actual !== null) return { amount: order.actual, estimated: false };
  const shape = `${order.boxes}|${round2(order.revenue)}`;
  const same = order.product_id ? observed.byProduct.get(`${order.product_id}|${shape}`) : undefined;
  if (same?.length) return { amount: median(same), estimated: true };
  const like = observed.byShape.get(shape);
  if (like?.length) return { amount: median(like), estimated: true };
  const cut = fees.transaction + fees.commission + fees.growth;
  return { amount: round2(order.revenue * (1 - cut) - (1 + 2 * Math.max(1, order.boxes))), estimated: true };
}

const nameOf = (p: Product | undefined) => (p ? p.short_name || p.variant || p.name : "?");

function variantLines(entries: { product_id: string; qty: number }[], products: Map<string, Product>): VariantLine[] {
  const sum = new Map<string, number>();
  for (const e of entries) sum.set(e.product_id, (sum.get(e.product_id) ?? 0) + e.qty);
  return Array.from(sum, ([product_id, qty]) => ({ product_id, name: nameOf(products.get(product_id)), unit: products.get(product_id)?.unit_label ?? "box", qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

/**
 * The one transfer's reason, from the same numbers as its amount (everything
 * to today): when the sender has paid less than half of all costs, the money
 * settles their half of the costs; otherwise it shares out profit.
 */
export function transferReason(transactions: ReportTx[], owes: WhoOwesWhom["owes"], today: string): "profit_share" | "my_half_of_costs" {
  if (!owes) return "profit_share";
  const costs = transactions.filter((t) => t.type === "expense" && t.date <= today && !t.synthetic);
  const total = costs.reduce((a, t) => a + t.net_amount, 0);
  const bySender = costs.filter((t) => t.payer === owes.from).reduce((a, t) => a + t.net_amount, 0);
  return bySender + 0.005 < total / 2 ? "my_half_of_costs" : "profit_share";
}

export function buildWeek(input: WeekInput, period: Period, today: string): WeekReport {
  const products = new Map(input.products.map((p) => [p.id, p]));
  const itemsOf = new Map<string, WeekInput["items"]>();
  for (const i of input.items) itemsOf.set(i.transaction_id, [...(itemsOf.get(i.transaction_id) ?? []), i]);
  const inWeek = (t: ReportTx) => t.date >= period.from && t.date <= period.to && !t.synthetic;
  const sales = input.transactions.filter((t) => t.type === "income" && inWeek(t) && (t.status ?? "active") === "active");
  const expenses = input.transactions.filter((t) => t.type === "expense" && inWeek(t));
  const categories = new Map(input.categories.map((c) => [c.id, c]));

  // 1. Sold.
  const soldLines = sales.flatMap((t) => (itemsOf.get(t.id) ?? []).map((i) => ({ product_id: i.product_id, qty: i.qty })));
  const cancelledBeforeShipping = input.cancelled.filter((t) => inWeek(t) && (t.tags ?? []).includes("cancelled_before_shipping")).length;

  // 2. What TikTok will pay.
  const fees = feeRule(input.facts);
  const factByTx = new Map<string, WeekFact>();
  const byProduct = new Map<string, number[]>();
  const byShape = new Map<string, number[]>();
  for (const f of input.facts) {
    if (f.kind !== "order" || f.revenue <= 0) continue;
    if (f.transaction_id) factByTx.set(f.transaction_id, f);
    const shape = `${f.boxes}|${round2(f.revenue)}`;
    byShape.set(shape, [...(byShape.get(shape) ?? []), f.settlement_amount]);
    const lines = f.transaction_id ? (itemsOf.get(f.transaction_id) ?? []) : [];
    if (lines.length === 1) byProduct.set(`${lines[0].product_id}|${shape}`, [...(byProduct.get(`${lines[0].product_id}|${shape}`) ?? []), f.settlement_amount]);
  }
  const allocated = new Map(input.allocations.map((a) => [a.order_ref, a.amount]));
  let expected = 0;
  let settled = 0;
  let advanced = 0;
  let estimatedOrders = 0;
  for (const t of sales.filter((s) => s.platform === "tiktok")) {
    const lines = itemsOf.get(t.id) ?? [];
    const fact = factByTx.get(t.id) ?? null;
    const product = lines.length === 1 ? (products.get(lines[0].product_id) ?? null) : null;
    const boxes = lines.reduce((a, l) => a + l.qty, 0) || t.quantity || 1;
    const revenue = product ? round2(salePriceFor(product, "tiktok") * boxes) : t.gross_amount;
    const e = expectedSettlement({ product_id: product?.id ?? null, boxes, revenue, actual: fact ? fact.settlement_amount : null }, { byProduct, byShape }, fees);
    expected = round2(expected + e.amount);
    if (fact) settled = round2(settled + fact.settlement_amount);
    else {
      estimatedOrders += 1;
      advanced = round2(advanced + (t.order_ref ? (allocated.get(t.order_ref) ?? 0) : 0));
    }
  }
  // Sales on other platforms: what the ledger says you receive.
  for (const t of sales.filter((s) => s.platform !== "tiktok")) expected = round2(expected + t.net_amount);

  // 3. Bought: stock purchases per variant, who paid, and every other cost.
  const purchaseRows = expenses.filter((t) => categories.get(t.category_id ?? "")?.stock_effect === "purchase");
  const boughtLines = purchaseRows.flatMap((t) => (itemsOf.get(t.id) ?? []).map((i) => ({ product_id: i.product_id, qty: i.qty })));
  const byPerson: Record<Person, number> = { mike: 0, sai: 0 };
  for (const t of purchaseRows) if (t.payer) byPerson[t.payer] = round2(byPerson[t.payer] + t.net_amount);
  const otherMap = new Map<string, number>();
  for (const t of expenses.filter((x) => !purchaseRows.includes(x))) {
    const label = categoryLabel(categories.get(t.category_id ?? ""), "en") || "Other";
    otherMap.set(label, round2((otherMap.get(label) ?? 0) + t.net_amount));
  }
  const other = Array.from(otherMap, ([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  const otherTotal = round2(other.reduce((a, o) => a + o.amount, 0));

  // 4. Profit to expect: what TikTok will pay, less what the units sold cost, less every other cost.
  const avgCost = new Map(valueStock(input.products, input.movements).products.map((r) => [r.product.id, r.avgCost]));
  const costOfUnits = round2(soldLines.reduce((a, l) => a + l.qty * (avgCost.get(l.product_id) || products.get(l.product_id)?.default_cost || 0), 0));

  // 5. Cash: the one who-owes-whom, as of today.
  const balance = whoOwesWhom({ transactions: input.transactions, transfers: input.transfers, cashAdjustments: input.cashAdjustments }, today);

  // 6. Buy: per variant, what is owed to customers plus that product's buffer. Every active product sold in the
  // last 30 days is listed, even with nothing owed, so a variant never drops off the list between weeks.
  const backlog = fifoBacklog(input.movements);
  const monthAgo = addDays(today, -29);
  const soldLately = new Set(input.movements.filter((m) => m.kind === "sale" && m.date >= monthAgo && m.date <= today).map((m) => m.product_id));
  const buy = input.products
    .filter((p) => p.active && ((backlog.get(p.id)?.backlog ?? 0) > 0 || soldLately.has(p.id)))
    .map((p) => {
      const owed = backlog.get(p.id)?.backlog ?? 0;
      const buffer = bufferFor(p);
      return { product_id: p.id, name: nameOf(p), unit: p.unit_label, backlog: owed, buffer, toBuy: owed + buffer };
    })
    .sort((a, b) => b.toBuy - a.toBuy || a.name.localeCompare(b.name));

  return {
    period,
    sold: { orders: sales.length, variants: variantLines(soldLines, products), cancelledBeforeShipping },
    tiktok: { expected, settled, advanced, stillToCome: stillToCome(sales.filter((t) => t.platform === "tiktok"), today).total, estimatedOrders },
    bought: { variants: variantLines(boughtLines, products), amount: round2(purchaseRows.reduce((a, t) => a + t.net_amount, 0)), byPerson, other, otherTotal },
    profit: { expectedIncome: expected, costOfUnits, otherCosts: otherTotal, expected: round2(expected - costOfUnits - otherTotal) },
    cash: { holdings: balance.holdings, owes: balance.owes, paid: balance.putIn, received: balance.received, advanced: balance.advancedFromPlatforms, reason: transferReason(input.transactions, balance.owes, today) },
    buy,
  };
}
