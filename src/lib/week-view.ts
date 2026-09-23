/**
 * The week report as words and one table: the page, the XLSX and the PDF all
 * read these lines, so the three can never disagree.
 */
import type { ExportTable } from "@/lib/exports/tables";
import type { Translator } from "@/lib/i18n/dictionary";
import { thb } from "@/lib/money";
import type { LedgerSnapshot } from "@/lib/data/ledger";
import type { Person } from "@/lib/types";
import { buildWeek, type WeekInput, type WeekReport } from "./week";
import type { Period } from "@/lib/reports/period";

/** The snapshot as the week builder reads it. */
export function weekInput(s: LedgerSnapshot): WeekInput {
  return {
    transactions: s.transactions,
    cancelled: s.cancelled,
    cashAdjustments: s.cashAdjustments,
    transfers: s.transfers as WeekInput["transfers"],
    items: s.items,
    products: s.products,
    movements: s.movements,
    categories: s.categories,
    facts: s.tiktokMoney.facts.map((f) => ({ order_ref: f.order_ref, kind: f.kind, transaction_id: f.transaction_id, settlement_amount: f.settlement_amount, revenue: f.revenue, boxes: f.boxes, fee_transaction: f.fee_transaction, fee_commission: f.fee_commission, fee_commerce_growth: f.fee_commerce_growth, fee_seller_shipping: f.fee_seller_shipping, pre_business: f.pre_business })),
    allocations: s.tiktokMoney.allocations,
  };
}

export function weekFromSnapshot(s: LedgerSnapshot, period: Period, today: string, locale: "en" | "th" = "en"): WeekReport {
  return buildWeek(weekInput(s), period, today, locale);
}

export type WeekLine = { section: string; label: string; count: number | null; amount: number | null };

/** "38 × 1 kg packs": a quantity and the variant it is of. */
export const unitsText = (tr: Translator, qty: number, name: string, unit: string) => tr("week.units", { n: qty, name, unit: tr(`products.unit.${unit as "box"}`) });

/**
 * A quantity in both units when a product is bought by the box and sold by
 * the bag: "3 boxes = 30 bags". Rounded up for a buy list (you buy whole
 * boxes), exact elsewhere.
 */
export function unitsBoth(tr: Translator, line: { qty: number; unit: string; perPurchaseUnit: number; purchaseUnit: string | null }, roundUp = false): string {
  const plain = unitsText(tr, line.qty, "", line.unit).trim();
  if (line.perPurchaseUnit <= 1 || !line.purchaseUnit) return plain;
  const packs = roundUp ? Math.ceil(line.qty / line.perPurchaseUnit) : Math.round((line.qty / line.perPurchaseUnit) * 100) / 100;
  return tr("inventory.boxesToUnits", { packs, purchaseUnit: tr(`products.unit.${line.purchaseUnit as "box"}`), units: line.qty, unit: tr(`products.unit.${line.unit as "bag"}`) });
}

export function weekLines(w: WeekReport, tr: Translator): WeekLine[] {
  const who = (p: Person) => tr(`common.${p}`);
  const sold = tr("week.sold");
  const pay = tr("week.tiktok");
  const bought = tr("week.bought");
  const profit = tr("week.profit");
  const cash = tr("week.cash");
  const buy = tr("week.buy");
  const lines: WeekLine[] = [
    { section: sold, label: tr("week.orders"), count: w.sold.orders, amount: null },
    ...w.sold.variants.map((v) => ({ section: sold, label: v.name, count: v.qty, amount: null })),
    { section: sold, label: tr("week.cancelledBeforeShipping"), count: w.sold.cancelledBeforeShipping, amount: null },
    { section: pay, label: tr("week.expected"), count: null, amount: w.tiktok.expected },
    { section: pay, label: tr("week.settled"), count: null, amount: w.tiktok.settled },
    { section: pay, label: tr("week.advanced"), count: null, amount: w.tiktok.advanced },
    { section: pay, label: tr("week.stillToCome"), count: null, amount: w.tiktok.stillToCome },
    ...w.bought.variants.map((v) => ({ section: bought, label: v.name, count: v.qty, amount: null })),
    { section: bought, label: tr("week.boughtAmount"), count: null, amount: w.bought.amount },
    ...(["mike", "sai"] as const).filter((p) => w.bought.byPerson[p] > 0).map((p) => ({ section: bought, label: tr("week.paidBy", { name: who(p) }), count: null, amount: w.bought.byPerson[p] })),
    ...w.bought.other.map((o) => ({ section: bought, label: o.label, count: null, amount: o.amount })),
    { section: profit, label: tr("week.profitExpected"), count: null, amount: w.profit.expected },
    { section: cash, label: tr("week.holds", { name: who("sai") }), count: null, amount: w.cash.holdings.sai },
    { section: cash, label: tr("week.holds", { name: who("mike") }), count: null, amount: w.cash.holdings.mike },
    { section: cash, label: w.cash.owes ? tr("week.sends", { from: who(w.cash.owes.from), to: who(w.cash.owes.to), amount: thb(w.cash.owes.amount) }) : tr("week.even"), count: null, amount: w.cash.owes?.amount ?? 0 },
    ...w.buy.map((b) => ({ section: buy, label: tr("week.buyLine", { name: b.name, backlog: b.backlog, buffer: b.buffer }), count: b.toBuy, amount: null })),
  ];
  return lines;
}

export function weekTable(w: WeekReport, tr: Translator): ExportTable {
  return {
    id: "week",
    title: tr("week.title"),
    description: tr("week.subtitle"),
    columns: [
      { key: "section", label: tr("week.section"), kind: "text" },
      { key: "line", label: tr("week.line"), kind: "text" },
      { key: "count", label: tr("week.count"), kind: "int" },
      { key: "amount", label: tr("common.amount"), kind: "money" },
    ],
    rows: weekLines(w, tr).map((l) => [l.section, l.label, l.count, l.amount]),
    totals: [],
    totalLabel: "",
  };
}
