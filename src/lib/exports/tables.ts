import type { Translator } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/dictionary";
import { categoryLabel } from "@/lib/categories";
import { platformName, productName } from "@/lib/labels";
import { productLabel } from "@/lib/inventory/reports";
import { formatDate } from "@/lib/money";
import type { ReportBundle } from "@/lib/reports/build";
import { shortProductName, type UnitsReport, type UnitsRow } from "@/lib/inventory/units";
import { shortPeriodLabel } from "@/lib/inventory/units-labels";

/**
 * One tabular description of every report. The on-screen page, the XLSX
 * writer and the PDF renderer all read from these tables, so the three can
 * never disagree on a number.
 */
export type Cell = string | number | null;
export type ColumnKind = "text" | "money" | "int" | "pct" | "date";
/** On screen a column is primary (always visible), secondary (from 1280px) or tertiary (from 1440px); hidden ones show in the row detail. Exports ignore it. */
export type ColumnPriority = "primary" | "secondary" | "tertiary";
export type Column = { key: string; label: string; kind: ColumnKind; priority?: ColumnPriority };
export type ExportTable = {
  id: ReportId;
  title: string;
  description: string;
  columns: Column[];
  rows: Cell[][];
  /** Column indexes that get a SUM formula in the total row. Empty means no total row. */
  totals: number[];
  totalLabel: string;
  /** Row indexes rendered as subtotals (bold, tinted) on screen and in both exports. */
  emphasis?: number[];
};

export const REPORT_IDS = ["movements", "units", "pl", "cashflow", "balance", "product", "platform", "category", "settlement", "owes", "customers", "stock", "lowstock", "profit", "plan", "samples"] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export function isReportId(v: unknown): v is ReportId {
  return typeof v === "string" && (REPORT_IDS as readonly string[]).includes(v);
}

/** Negative of a number without producing -0, which Excel and deep-equality treat differently from 0. */
const neg = (n: number): number => (n === 0 ? 0 : -n);

export function reportTables(bundle: ReportBundle, tr: Translator, locale: Locale): ExportTable[] {
  const pl = bundle.accrual;
  const plRows: Cell[][] = [
    [tr("reports.plIncome"), pl.gross],
    [tr("reports.plFees"), neg(pl.fees)],
    [tr("reports.plNet"), pl.revenue],
    ...(pl.cancelled.count > 0 ? [[`${tr("reports.cancelledLine")} (${pl.cancelled.count})`, neg(pl.cancelled.amount)] as Cell[]] : []),
    [tr("reports.cogs"), neg(pl.cogs)],
    [tr("reports.grossMargin"), pl.grossMargin],
    ...pl.operating.map((e): Cell[] => [`${tr("reports.plOperating")} · ${categoryLabel(e.category, locale)}`, neg(e.amount)]),
    ...(pl.corrections !== 0 ? [[`${tr("reports.plOperating")} · ${tr("reports.plCorrections")}`, neg(pl.corrections)] as Cell[]] : []),
    [tr("reports.plOperating"), neg(pl.totalOperating)],
    [tr("reports.plProfit"), pl.profit],
    [tr("reports.plStockBought"), pl.stockPurchasesCash],
  ];
  const cf = bundle.cashFlow;
  const cashRows: Cell[][] = [
    [tr("reports.cashIn"), cf.cashIn],
    [`${tr("reports.cashOut")} · ${tr("reports.cashOutStock")}`, neg(cf.stockOut)],
    [`${tr("reports.cashOut")} · ${tr("reports.cashOutOperating")}`, neg(cf.operatingOut)],
    [tr("reports.cashOut"), neg(cf.cashOut)],
    [tr("reports.cashNet"), cf.net],
  ];
  const bs = bundle.balanceSheet;
  const balanceRows: Cell[][] = [
    [tr("reports.bsReceived", { name: tr("common.mike") }), bs.received.mike],
    [tr("reports.bsPutIn", { name: tr("common.mike") }), neg(bs.putIn.mike)],
    [tr("reports.bsReceived", { name: tr("common.sai") }), bs.received.sai],
    [tr("reports.bsPutIn", { name: tr("common.sai") }), neg(bs.putIn.sai)],
    [tr("reports.bsCashTotal"), bs.cashTotal],
    [tr("reports.bsReceivables"), bs.receivables],
    [tr("reports.bsInventory"), bs.inventory],
    [tr("reports.bsAssets"), bs.assets],
    [tr("reports.bsBacklog"), neg(bs.backlog)],
    [tr("reports.bsEquity"), bs.equity],
    [tr("reports.bsShare", { name: tr("common.mike") }), bs.equityShare.mike],
    [tr("reports.bsShare", { name: tr("common.sai") }), bs.equityShare.sai],
    [tr("reports.bsProfitToDate"), bs.cumulativeProfit],
    [tr("reports.bsDifference"), bs.difference],
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
      id: "cashflow",
      title: tr("reports.cashflow"),
      description: tr("reports.cashflowDesc"),
      columns: [
        { key: "line", label: tr("reports.cashflow"), kind: "text" },
        { key: "amount", label: tr("common.amount"), kind: "money" },
      ],
      rows: cashRows,
      totals: [],
      totalLabel: tr("common.total"),
    },
    {
      id: "balance",
      title: tr("reports.balance"),
      description: tr("reports.balanceDesc", { date: formatDate(bs.asOf, locale) }),
      columns: [
        { key: "line", label: tr("reports.balance"), kind: "text" },
        { key: "amount", label: tr("common.amount"), kind: "money" },
      ],
      rows: balanceRows,
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
        { key: "gross", label: tr("common.gross"), kind: "money", priority: "tertiary" },
        { key: "net", label: tr("common.net"), kind: "money" },
        { key: "cogs", label: tr("reports.cogs"), kind: "money", priority: "secondary" },
        { key: "grossMargin", label: tr("reports.grossMargin"), kind: "money" },
        { key: "netPerUnit", label: tr("reports.netPerUnit"), kind: "money", priority: "secondary" },
      ],
      rows: bundle.byProduct.map((r) => [productName(tr, r.product), r.orders, r.units, r.gross, r.net, r.cogs, r.grossMargin, r.netPerUnit]),
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
      title: tr("reports.byCategoryCash"),
      description: tr("reports.byCategoryCashDesc"),
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
        { key: "pendingOrders", label: `${tr("reports.waiting")} · ${tr("common.orders")}`, kind: "int", priority: "secondary" },
        { key: "pending", label: tr("reports.waiting"), kind: "money" },
        { key: "walletOrders", label: `${tr("reports.inWallet")} · ${tr("common.orders")}`, kind: "int", priority: "secondary" },
        { key: "wallet", label: tr("reports.inWallet"), kind: "money" },
        { key: "bankOrders", label: `${tr("reports.inBank")} · ${tr("common.orders")}`, kind: "int", priority: "secondary" },
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
        { key: "mikeReceived", label: tr("reports.received", { name: tr("common.mike") }), kind: "money" },
        { key: "mikePutIn", label: tr("reports.putIn", { name: tr("common.mike") }), kind: "money", priority: "secondary" },
        { key: "saiReceived", label: tr("reports.received", { name: tr("common.sai") }), kind: "money" },
        { key: "saiPutIn", label: tr("reports.putIn", { name: tr("common.sai") }), kind: "money", priority: "secondary" },
        { key: "profit", label: tr("dashboard.netProfit"), kind: "money" },
        { key: "owes", label: tr("reports.owes"), kind: "text" },
      ],
      rows: bundle.owesHistory.map((r) => [
        formatDate(r.asOf, locale),
        r.received.mike,
        r.putIn.mike,
        r.received.sai,
        r.putIn.sai,
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
        { key: "gross", label: tr("common.gross"), kind: "money", priority: "tertiary" },
        { key: "net", label: tr("common.net"), kind: "money" },
        { key: "lastOrder", label: tr("reports.lastOrder"), kind: "date", priority: "secondary" },
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
      description: tr("reports.stockDescBacklog"),
      columns: [
        { key: "product", label: tr("common.product"), kind: "text" },
        { key: "unit", label: tr("inventory.unit"), kind: "text", priority: "secondary" },
        { key: "onHand", label: tr("reports.onHand"), kind: "int" },
        { key: "backlog", label: tr("units.backlog"), kind: "int" },
        { key: "avgCost", label: tr("reports.avgCost"), kind: "money", priority: "secondary" },
        { key: "value", label: tr("reports.value"), kind: "money" },
        { key: "threshold", label: tr("reports.threshold"), kind: "int", priority: "tertiary" },
      ],
      rows: inv.stock.map((r) => [productLabel(r.product), r.product.unit_label, Math.max(0, r.onHand), r.backlog, r.avgCost, r.value, r.product.low_stock_threshold]),
      totals: [5],
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
      rows: inv.lowStock.map((r) => [productLabel(r.product), Math.max(0, r.onHand), r.product.low_stock_threshold]),
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
      id: "plan",
      title: tr("reports.marginPlan"),
      description: tr("reports.marginPlanDesc"),
      columns: [
        { key: "product", label: tr("common.product"), kind: "text" },
        { key: "qty", label: tr("reports.units"), kind: "int" },
        { key: "expectedNet", label: tr("reports.expectedNet"), kind: "money", priority: "tertiary" },
        { key: "realizedNet", label: tr("reports.realizedNet"), kind: "money", priority: "tertiary" },
        { key: "expected", label: tr("reports.expectedMargin"), kind: "money", priority: "secondary" },
        { key: "actual", label: tr("reports.actualMargin"), kind: "money", priority: "secondary" },
        { key: "variance", label: tr("reports.variance"), kind: "money" },
        { key: "variancePct", label: tr("reports.variancePct"), kind: "pct" },
        { key: "flag", label: tr("reports.flag"), kind: "text" },
      ],
      rows: inv.marginPlan.map((r) => [productLabel(r.product), r.qty, r.expectedNetPerUnit, r.realizedNetPerUnit, r.expectedMargin, r.actualMargin, r.variance, r.variancePct, r.worse ? tr("reports.worse") : ""]),
      totals: [1, 4, 5, 6],
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

/** Stock movement history for the Stock page export. */
export function movementsTable(rows: import("@/lib/inventory/stock-page").MovementRow[], tr: Translator, locale: Locale): ExportTable {
  return {
    id: "movements",
    title: tr("stock.history"),
    description: tr("stock.historyDesc"),
    columns: [
      { key: "date", label: tr("common.date"), kind: "date" },
      { key: "product", label: tr("common.product"), kind: "text" },
      { key: "kind", label: tr("stock.kind"), kind: "text" },
      { key: "qty", label: tr("inventory.qty"), kind: "int" },
      { key: "perUnit", label: tr("stock.perUnit"), kind: "money", priority: "secondary" },
      { key: "who", label: tr("stock.recordedBy"), kind: "text", priority: "secondary" },
      { key: "note", label: tr("common.note"), kind: "text", priority: "tertiary" },
    ],
    rows: rows.map((m) => [formatDate(m.date, locale), shortProductName(m.product, locale), tr(`stock.kind.${m.kind}`), m.qty, m.perUnit, m.who ?? "", m.note]),
    totals: [3],
    totalLabel: tr("common.total"),
  };
}

/** Units per product per day, week or month, with subtotals and a per-product total. */
export function unitsTable(report: UnitsReport, tr: Translator, locale: Locale): ExportTable {
  const label = (r: UnitsRow): string => shortPeriodLabel(r.from, r.to, r.kind, locale, tr("common.total"));
  const toCells = (r: UnitsRow): Cell[] => [label(r), shortProductName(r.product, locale), r.orders, r.unitsSold, r.unitsBought, r.samplesOut, r.unitsReturned, r.onHandEnd, r.backlogEnd, r.avgSalePrice, r.avgCostEnd];
  const all = [...report.rows, ...report.totals];
  return {
    id: "units",
    title: tr("units.title"),
    description: tr("units.desc"),
    columns: [
      { key: "period", label: tr("reports.period"), kind: "text" },
      { key: "product", label: tr("common.product"), kind: "text" },
      { key: "orders", label: tr("common.orders"), kind: "int" },
      { key: "sold", label: tr("units.sold"), kind: "int" },
      { key: "bought", label: tr("units.bought"), kind: "int" },
      { key: "samples", label: tr("units.samples"), kind: "int", priority: "secondary" },
      { key: "returns", label: tr("units.returns"), kind: "int", priority: "secondary" },
      { key: "onHand", label: tr("units.onHandEnd"), kind: "int" },
      { key: "backlog", label: tr("units.backlog"), kind: "int" },
      { key: "avgPrice", label: tr("units.avgPrice"), kind: "money", priority: "tertiary" },
      { key: "avgCost", label: tr("units.avgCost"), kind: "money", priority: "tertiary" },
    ],
    rows: all.map(toCells),
    totals: [],
    totalLabel: tr("common.total"),
    emphasis: all.map((r, i) => (r.kind === report.granularity ? -1 : i)).filter((i) => i >= 0),
  };
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
