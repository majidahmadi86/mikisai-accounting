import type { Translator } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/dictionary";
import { categoryName, platformName, productName } from "@/lib/labels";
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

export const REPORT_IDS = ["pl", "product", "platform", "category", "settlement", "owes", "customers"] as const;
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
    ...pl.expenses.map((e): Cell[] => [`${tr("reports.plExpenses")} · ${categoryName(tr, e.category)}`, -e.amount]),
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
      ],
      rows: bundle.byCategory.map((r) => [categoryName(tr, r.category), r.count, r.amount, r.share]),
      totals: [1, 2],
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
