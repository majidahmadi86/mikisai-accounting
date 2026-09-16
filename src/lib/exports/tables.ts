import type { Translator } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/dictionary";
import { categoryLabel } from "@/lib/categories";
import { platformName, productName } from "@/lib/labels";
import { productLabel } from "@/lib/inventory/reports";
import { formatDate } from "@/lib/money";
import type { ReportBundle } from "@/lib/reports/build";

/**
 * One tabular description of every report. The on-screen page, the XLSX
 * writer and the PDF renderer all read from these tables, so the three can
 * never disagree on a number.
 */
export type Cell = string | number | null;
export type ColumnKind = "text" | "money" | "int" | "pct" | "date";
export type Column = { key: string; label: string; kind: ColumnKind };
export type ExportTable = {
  id: ReportId;
  title: string;
  description: string;
  columns: Column[];
  rows: Cell[][];
  /** Column indexes that get a SUM formula in the total row. Empty means no total row. */
  totals: number[];
  totalLabel: string;
};

export const REPORT_IDS = ["pl", "product", "platform", "category", "settlement", "owes", "customers", "stock", "lowstock", "profit", "samples"] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export function isReportId(v: unknown): v is ReportId {
  return typeof v === "string" && (REPORT_IDS as readonly string[]).includes(v);
}

export function reportTables(bundle: ReportBundle, tr: Translator, locale: Locale): ExportTable[] {
  const pl = bundle.pl;
  const plRows: Cell[][] = [
    [tr("reports.plIncome"), pl.gross],
    [tr("reports.plFees"), -pl.fees],
    [tr("reports.plNet"), pl.net],
    ...pl.expenses.map((e): Cell[] => [`${tr("reports.plExpenses")} · ${categoryLabel(e.category, locale)}`, -e.amount]),
    [tr("reports.plExpenses"), -pl.totalExpenses],
    [tr("reports.plProfit"), pl.profit],
  ];

  return [
    {
      id: "pl",
      title: tr("reports.pl"),
      description: tr("reports.plDesc"),
      columns: [
        { key: "line", label: tr("reports.pl"), kind: "text" },
        { key: "amount", label: tr("common.amount"), kind: "money" },
      ],
      rows: plRows,
      totals: [],
      totalLabel: tr("common.total"),
    },
    {
      id: "product",
      title: tr("reports.byProduct"),
      description: tr("reports.byProductDesc"),
      columns: [
        { key: "product", label: tr("common.product"), kind: "text" },
        { key: "orders", label: tr("common.orders"), kind: "int" },
        { key: "units", label: tr("reports.units"), kind: "int" },
        { key: "gross", label: tr("common.gross"), kind: "money" },
        { key: "net", label: tr("common.net"), kind: "money" },
        { key: "expenses", label: tr("reports.plExpenses"), kind: "money" },
        { key: "profit", label: tr("reports.profit"), kind: "money" },
        { key: "netPerUnit", label: tr("reports.netPerUnit"), kind: "money" },
      ],
      rows: bundle.byProduct.map((r) => [productName(tr, r.product), r.orders, r.units, r.gross, r.net, r.expenses, r.profit, r.netPerUnit]),
      totals: [1, 2, 3, 4, 5, 6],
      totalLabel: tr("common.total"),
    },
    {
      id: "platform",
      title: tr("reports.byPlatform"),
      description: tr("reports.byPlatformDesc"),
      columns: [
        { key: "platform", label: tr("common.platform"), kind: "text" },
        { key: "orders", label: tr("common.orders"), kind: "int" },
        { key: "gross", label: tr("common.gross"), kind: "money" },
        { key: "net", label: tr("common.net"), kind: "money" },
        { key: "fees", label: tr("reports.fees"), kind: "money" },
        { key: "feePct", label: tr("reports.feePct"), kind: "pct" },
      ],
      rows: bundle.byPlatform.map((r) => [platformName(tr, r.platform), r.orders, r.gross, r.net, r.fees, r.feePct]),
      totals: [1, 2, 3, 4],
      totalLabel: tr("common.total"),
    },
    {
      id: "category",
      title: tr("reports.byCategory"),
      description: tr("reports.byCategoryDesc"),
      columns: [
        { key: "category", label: tr("common.category"), kind: "text" },
        { key: "count", label: tr("reports.count"), kind: "int" },
        { key: "amount", label: tr("common.amount"), kind: "money" },
        { key: "share", label: tr("reports.share"), kind: "pct" },
        { key: "previous", label: tr("reports.prevPeriod"), kind: "money" },
        { key: "change", label: tr("reports.change"), kind: "pct" },
      ],
      rows: bundle.byCategory.map((r) => [categoryLabel(r.category, locale), r.count, r.amount, r.share, r.previous, r.changePct]),
      totals: [1, 2, 4],
      totalLabel: tr("common.total"),
    },
    {
      id: "settlement",
      title: tr("reports.settlement"),
      description: tr("reports.settlementDesc"),
      columns: [
        { key: "platform", label: tr("common.platform"), kind: "text" },
        { key: "pendingOrders", label: `${tr("reports.waiting")} · ${tr("common.orders")}`, kind: "int" },
        { key: "pending", label: tr("reports.waiting"), kind: "money" },
        { key: "walletOrders", label: `${tr("reports.inWallet")} · ${tr("common.orders")}`, kind: "int" },
        { key: "wallet", label: tr("reports.inWallet"), kind: "money" },
        { key: "bankOrders", label: `${tr("reports.inBank")} · ${tr("common.orders")}`, kind: "int" },
        { key: "bank", label: tr("reports.inBank"), kind: "money" },
        { key: "total", label: tr("common.total"), kind: "money" },
      ],
      rows: bundle.settlement.map((r) => [platformName(tr, r.platform), r.pendingOrders, r.pending, r.walletOrders, r.wallet, r.bankOrders, r.bank, r.total]),
      totals: [1, 2, 3, 4, 5, 6, 7],
      totalLabel: tr("common.total"),
    },
    {
      id: "owes",
      title: tr("reports.owes"),
      description: tr("reports.owesDesc"),
      columns: [
        { key: "asOf", label: tr("reports.asOf"), kind: "date" },
        { key: "mike", label: tr("reports.holds", { name: tr("common.mike") }), kind: "money" },
        { key: "sai", label: tr("reports.holds", { name: tr("common.sai") }), kind: "money" },
        { key: "profit", label: tr("dashboard.netProfit"), kind: "money" },
        { key: "owes", label: tr("reports.owes"), kind: "text" },
      ],
      rows: bundle.owesHistory.map((r) => [
        formatDate(r.asOf, locale),
        r.mikeHolds,
        r.saiHolds,
        r.netProfit,
        r.owes ? tr("dashboard.owes", { from: tr(`common.${r.owes.from}`), to: tr(`common.${r.owes.to}`), amount: `฿${r.owes.amount.toFixed(2)}` }) : tr("reports.balanced"),
      ]),
      totals: [],
      totalLabel: tr("common.total"),
    },
    {
      id: "customers",
      title: tr("reports.customers"),
      description: tr("reports.customersDesc"),
      columns: [
        { key: "name", label: tr("common.customer"), kind: "text" },
        { key: "platform", label: tr("common.platform"), kind: "text" },
        { key: "orders", label: tr("common.orders"), kind: "int" },
        { key: "gross", label: tr("common.gross"), kind: "money" },
        { key: "net", label: tr("common.net"), kind: "money" },
        { key: "lastOrder", label: tr("reports.lastOrder"), kind: "date" },
      ],
      rows: bundle.customers.map((c) => [c.name, platformName(tr, c.platform), c.orders, c.gross, c.net, formatDate(c.lastOrder, locale)]),
      totals: [2, 3, 4],
      totalLabel: tr("common.total"),
    },
  ];
}

/** Stock on hand, low stock, profitability and samples. Empty when inventory is not part of the bundle. */
export function inventoryTables(bundle: ReportBundle, tr: Translator): ExportTable[] {
  const inv = bundle.inventory;
  if (!inv) return [];
  return [
    {
      id: "stock",
      title: tr("reports.stock"),
      description: tr("reports.stockDesc"),
      columns: [
        { key: "product", label: tr("common.product"), kind: "text" },
        { key: "unit", label: tr("inventory.unit"), kind: "text" },
        { key: "onHand", label: tr("reports.onHand"), kind: "int" },
        { key: "avgCost", label: tr("reports.avgCost"), kind: "money" },
        { key: "value", label: tr("reports.value"), kind: "money" },
        { key: "threshold", label: tr("reports.threshold"), kind: "int" },
      ],
      rows: inv.stock.map((r) => [productLabel(r.product), r.product.unit_label, r.onHand, r.avgCost, r.value, r.product.low_stock_threshold]),
      totals: [4],
      totalLabel: tr("common.total"),
    },
    {
      id: "lowstock",
      title: tr("reports.lowStock"),
      description: tr("reports.lowStockDesc"),
      columns: [
        { key: "product", label: tr("common.product"), kind: "text" },
        { key: "onHand", label: tr("reports.onHand"), kind: "int" },
        { key: "threshold", label: tr("reports.threshold"), kind: "int" },
      ],
      rows: inv.lowStock.map((r) => [productLabel(r.product), r.onHand, r.product.low_stock_threshold]),
      totals: [],
      totalLabel: tr("common.total"),
    },
    {
      id: "profit",
      title: tr("reports.profitability"),
      description: tr("reports.profitabilityDesc"),
      columns: [
        { key: "product", label: tr("common.product"), kind: "text" },
        { key: "qty", label: tr("reports.units"), kind: "int" },
        { key: "revenue", label: tr("reports.revenue"), kind: "money" },
        { key: "cogs", label: tr("reports.cogs"), kind: "money" },
        { key: "margin", label: tr("reports.grossMargin"), kind: "money" },
        { key: "marginPct", label: tr("reports.marginPct"), kind: "pct" },
      ],
      rows: inv.profitability.map((r) => [productLabel(r.product), r.qty, r.revenue, r.cogs, r.grossMargin, r.marginPct]),
      totals: [1, 2, 3, 4],
      totalLabel: tr("common.total"),
    },
    {
      id: "samples",
      title: tr("reports.samples"),
      description: tr("reports.samplesDesc"),
      columns: [
        { key: "product", label: tr("common.product"), kind: "text" },
        { key: "qty", label: tr("reports.units"), kind: "int" },
        { key: "cost", label: tr("common.amount"), kind: "money" },
      ],
      rows: inv.samples.map((r) => [productLabel(r.product), r.qty, r.cost]),
      totals: [1, 2],
      totalLabel: tr("common.total"),
    },
  ];
}

/** Transfers listed under the who-owes-whom report. */
export function transferTable(bundle: ReportBundle, tr: Translator, locale: Locale): ExportTable {
  return {
    id: "owes",
    title: tr("reports.transfersInPeriod"),
    description: "",
    columns: [
      { key: "date", label: tr("common.date"), kind: "date" },
      { key: "from", label: tr("transfer.from"), kind: "text" },
      { key: "to", label: tr("transfer.to"), kind: "text" },
      { key: "amount", label: tr("common.amount"), kind: "money" },
      { key: "note", label: tr("common.note"), kind: "text" },
    ],
    rows: bundle.transfers.map((t) => [formatDate(t.date, locale), tr(`common.${t.from_person}`), tr(`common.${t.to_person}`), t.amount, t.note]),
    totals: [3],
    totalLabel: tr("common.total"),
  };
}
