/**
 * The TikTok Finance statement (Seller Center, Finance, Income export, .xlsx),
 * read exactly as TikTok writes it. Pure: grids in, typed rows out.
 *
 * Sheet "Order details": one row per settled order, refund, or early-settlement
 * movement. Sheet "Withdrawal records": the wallet (earnings credited, money
 * withdrawn to the bank, and "/" rows that mirror the early-settlement rows).
 * Sheet "Reports": only its "Time period" cell is read. Dates are Gregorian
 * yyyy/mm/dd and numbers are strings.
 */
import { round2 } from "@/lib/money";

export type Grid = string[][];

export const STATEMENT_SHEETS = { orders: "Order details", wallet: "Withdrawal records", reports: "Reports" } as const;

export type StatementRowType = "order" | "refund" | "advance_disbursement" | "advance_recovery" | "other";

export type StatementRow = {
  /** Order/Adjustment ID. */
  id: string;
  type: StatementRowType;
  raw_type: string;
  created: string | null;
  settled: string | null;
  settlement: number;
  revenue: number;
  refund_subtotal: number;
  fee_total: number;
  fee_transaction: number;
  fee_commission: number;
  fee_seller_shipping: number;
  fee_commerce_growth: number;
  platform_discount: number;
  adjustment: number;
  related_order_id: string | null;
  chargeable_weight_g: number | null;
  /** "<sku_id> * <qty>;" pairs; empty when TikTok wrote "/". */
  items: { sku_id: string; qty: number }[];
  row_number: number;
};

export type WalletRowKind = "earnings" | "withdrawal" | "mirror";
export type WalletRow = { kind: WalletRowKind; reference: string; requested: string | null; amount: number; status: string; success: string | null; bank: string; row_number: number };

export type Statement = { period: { from: string; to: string } | null; rows: StatementRow[]; wallet: WalletRow[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** "12.50", "1,250.00", "-45", "/" or "" as a number; anything unreadable is 0. */
export function num(text: string | undefined | null): number {
  const t = (text ?? "").replace(/[,\s฿]/g, "");
  if (!t || t === "/") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? round2(n) : 0;
}

/** "2026/09/16", "2026/09/16 14:03:22" or "2026-09-16" as an ISO day; "/" and blanks are null. */
export function day(text: string | undefined | null): string | null {
  const m = (text ?? "").trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** "1734376099134211076 * 1; 1734376099134276612 * 2;" as pairs. "/" means TikTok gave no details. */
export function parseItems(text: string | undefined | null): { sku_id: string; qty: number }[] {
  const out: { sku_id: string; qty: number }[] = [];
  for (const part of (text ?? "").split(";")) {
    const m = part.trim().match(/^(\d{6,})\s*\*\s*(\d+)$/);
    if (m) out.push({ sku_id: m[1], qty: Number(m[2]) });
  }
  return out;
}

/** True for the header row of "Order details", in a workbook or in a CSV of that sheet alone. */
export function isStatementHeader(headers: string[]): boolean {
  const set = new Set(headers.map(norm));
  return set.has("orderadjustmentid") && set.has("totalsettlementamount") && set.has("transactiontype");
}

function records(grid: Grid, isHeader: (cells: string[]) => boolean): { rows: Record<string, string>[]; first: number } {
  const at = grid.findIndex(isHeader);
  if (at < 0) return { rows: [], first: -1 };
  const headers = grid[at].map(norm);
  const rows = grid.slice(at + 1).filter((cells) => cells.some((c) => c.trim())).map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])));
  return { rows, first: at + 2 };
}

function rowType(raw: string, refundSubtotal: number, settlement: number): StatementRowType {
  const t = norm(raw);
  if (t === "earlysettlementdisbursement") return "advance_disbursement";
  if (t === "earlysettlementrecovery") return "advance_recovery";
  if (t === "order") return refundSubtotal < 0 || settlement < 0 ? "refund" : "order";
  return "other";
}

export function readOrderDetails(grid: Grid): StatementRow[] {
  const { rows, first } = records(grid, isStatementHeader);
  return rows
    .filter((r) => r.orderadjustmentid)
    .map((r, i): StatementRow => {
      const settlement = num(r.totalsettlementamount);
      const refund = num(r.refundsubtotalbeforesellerdiscounts);
      const weight = num(r.chargeablepackageweight);
      const related = r.relatedorderid && r.relatedorderid !== "/" ? r.relatedorderid : null;
      return {
        id: r.orderadjustmentid,
        type: rowType(r.transactiontype ?? "", refund, settlement),
        raw_type: r.transactiontype ?? "",
        created: day(r.ordercreatedtime),
        settled: day(r.ordersettledtime),
        settlement,
        revenue: num(r.totalrevenue),
        refund_subtotal: refund,
        fee_total: num(r.totalfees),
        fee_transaction: num(r.transactionfee),
        fee_commission: num(r.tiktokshopcommissionfee),
        fee_seller_shipping: num(r.sellershippingfee),
        fee_commerce_growth: num(r.commercegrowthfee),
        platform_discount: num(r.platformdiscount),
        adjustment: num(r.adjustmentamount),
        related_order_id: related,
        chargeable_weight_g: weight > 0 ? Math.round(weight) : null,
        items: parseItems(r.detailsofitemssold),
        row_number: first + i,
      };
    });
}

function walletKind(raw: string): WalletRowKind | null {
  const t = norm(raw);
  if (t === "earnings") return "earnings";
  if (t === "withdrawal") return "withdrawal";
  if (raw.trim() === "/") return "mirror";
  return null;
}

export function readWallet(grid: Grid): WalletRow[] {
  const { rows, first } = records(grid, (cells) => {
    const set = new Set(cells.map(norm));
    return set.has("referenceid") && set.has("transactiontype") && set.has("amount");
  });
  const out: WalletRow[] = [];
  rows.forEach((r, i) => {
    const kind = walletKind(r.transactiontype ?? "");
    if (!kind || !r.referenceid) return;
    out.push({ kind, reference: r.referenceid, requested: day(r.requesttime), amount: num(r.amount), status: r.status ?? "", success: day(r.successtime), bank: r.bankaccount && r.bankaccount !== "/" ? r.bankaccount : "", row_number: first + i });
  });
  return out;
}

/** The "Time period" cell of the Reports sheet: the value beside or under the label, "2026/09/01 - 2026/09/20". */
export function readPeriod(grid: Grid): { from: string; to: string } | null {
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      if (!/^time\s*period/i.test(grid[r][c].trim())) continue;
      for (const text of [grid[r][c], grid[r][c + 1] ?? "", grid[r + 1]?.[c] ?? ""]) {
        const days = text.match(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/g);
        if (days && days.length >= 2) return { from: day(days[0])!, to: day(days[1])! };
      }
    }
  }
  return null;
}

/** A workbook's sheets (by name) as one statement. The period falls back to the first and last settled day. */
export function readStatement(sheets: Record<string, Grid>): Statement | null {
  const find = (name: string) => Object.entries(sheets).find(([n]) => norm(n) === norm(name))?.[1];
  const orderGrid = find(STATEMENT_SHEETS.orders) ?? Object.values(sheets).find((g) => g.some(isStatementHeader));
  if (!orderGrid || !orderGrid.some(isStatementHeader)) return null;
  const rows = readOrderDetails(orderGrid);
  const wallet = readWallet(find(STATEMENT_SHEETS.wallet) ?? []);
  let period = readPeriod(find(STATEMENT_SHEETS.reports) ?? []);
  if (!period) {
    const days = rows.map((r) => r.settled).filter((d): d is string => Boolean(d)).sort();
    if (days.length) period = { from: days[0], to: days[days.length - 1] };
  }
  return { period, rows, wallet };
}

/** Several statements dropped at once read as one: rows and wallet lines together, the period from the first day to the last. */
export function mergeStatements(list: Statement[]): Statement {
  const periods = list.map((s) => s.period).filter((p): p is { from: string; to: string } => Boolean(p));
  const period = periods.length ? { from: periods.map((p) => p.from).sort()[0], to: periods.map((p) => p.to).sort().slice(-1)[0] } : null;
  return { period, rows: list.flatMap((s) => s.rows), wallet: list.flatMap((s) => s.wallet) };
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

export type SkuEntry = { product_id: string | null; multiplier: number };

/** Boxes when TikTok gave no item details: 399 is one, 759 or 798 two, 1,099 or 1,197 three. */
export function boxesFromRevenue(revenue: number): number | null {
  const r = Math.round(revenue);
  if (r === 399) return 1;
  if (r === 759 || r === 798) return 2;
  if (r === 1099 || r === 1197) return 3;
  return null;
}

export type Units = { product_id: string | null; boxes: number | null; inferred: boolean; unknown_skus: string[] };

/**
 * How many boxes of which product a statement row sold. The SKU map decides
 * (a listing can stand for two or three boxes); with no details the revenue
 * decides and the row is tagged "qty inferred".
 */
export function unitsOf(row: Pick<StatementRow, "items" | "revenue">, skus: Map<string, SkuEntry>, fallbackProductId: string | null): Units {
  if (row.items.length === 0) return { product_id: fallbackProductId, boxes: boxesFromRevenue(row.revenue), inferred: true, unknown_skus: [] };
  let boxes = 0;
  let product: string | null = null;
  const unknown: string[] = [];
  for (const item of row.items) {
    const entry = skus.get(`id:${item.sku_id}`);
    if (!entry || !entry.product_id) {
      unknown.push(item.sku_id);
      continue;
    }
    product = product ?? entry.product_id;
    boxes += item.qty * entry.multiplier;
  }
  if (unknown.length) return { product_id: product, boxes: null, inferred: false, unknown_skus: unknown };
  return { product_id: product, boxes, inferred: false, unknown_skus: [] };
}

export const OVERWEIGHT_GRAMS_PER_BOX = 10_000;

/** A parcel charged above 10 kg per box costs extra shipping. */
export function isOverweight(chargeableWeightG: number | null, boxes: number | null): boolean {
  return chargeableWeightG != null && chargeableWeightG > OVERWEIGHT_GRAMS_PER_BOX * Math.max(1, boxes ?? 1);
}
