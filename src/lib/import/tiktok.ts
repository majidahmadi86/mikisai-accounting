import { round2 } from "@/lib/money";
import { normalizeDate, thaiDigitsToArabic } from "./dates";
import { cleanHeaders, findHeaderRow, parseCsv, readXlsxGrid, rowsUnder } from "./table";

export { normalizeDate } from "./dates";

/**
 * Reads the two files Mike downloads from TikTok Seller Center: the Orders export
 * (one row per SKU line) and the Finance statement (one row per settled order or
 * adjustment). Column headers change wording and language, so they are matched
 * by meaning, and the admin can save a corrected mapping.
 */

export type ImportFileType = "orders" | "finance" | "unknown";

export const FIELD_KEYS = [
  "order_id",
  "order_status",
  "cancel_type",
  "created_at",
  "paid_at",
  "delivered_at",
  "cancelled_at",
  "sku_id",
  "sku_name",
  "variant",
  "quantity",
  "unit_price",
  "subtotal",
  "order_amount",
  "refund_amount",
  "seller_received",
  "buyer_name",
  "settled_at",
  "statement_type",
  "statement_status",
  "payment_id",
  "payout_date",
  "payout_amount",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

/** field -> exact header text as it appears in the file */
export type ColumnMapping = Partial<Record<FieldKey, string>>;

export type ParsedTable = { headers: string[]; rows: Record<string, string>[]; headerRowIndex: number; sheetName: string | null };

/* ------------------------------------------------------------------ */
/* Header synonyms                                                     */
/* ------------------------------------------------------------------ */

/** Lowercase, Thai digits to Arabic, punctuation and spaces removed, so "Order id " equals "order_id". */
export function normalizeHeader(text: string): string {
  return thaiDigitsToArabic(text)
    .toLowerCase()
    .replace(/[\s\-_/\\.,:;()[\]{}'"#*&+?!%|]+/g, "")
    .replace(/[​-‍﻿]/g, "");
}

type Synonyms = { names: string[]; avoid?: string[] };

/**
 * Names are already normalised. Order matters: the first name that matches wins.
 * `avoid` words block contains-matches that would pick the wrong column
 * (for example "Sku Quantity of return" is not the line quantity).
 */
const SYNONYMS: Record<FieldKey, Synonyms> = {
  order_id: {
    names: ["orderid", "orderadjustmentid", "orderno", "ordernumber", "หมายเลขคำสั่งซื้อ", "รหัสคำสั่งซื้อ", "รหัสคำสั่งซื้อการปรับปรุง", "เลขที่คำสั่งซื้อ"],
    avoid: ["sku", "product", "item", "adjustmentstatus"],
  },
  order_status: {
    names: ["orderstatus", "สถานะคำสั่งซื้อ", "สถานะการสั่งซื้อ", "status", "สถานะ"],
    avoid: ["sub", "payment", "settlement", "statement", "ชำระ"],
  },
  cancel_type: {
    names: ["cancelationreturntype", "cancellationreturntype", "cancelationtype", "cancellationtype", "canceltype", "returntype", "ประเภทการยกเลิกการคืนสินค้า", "ประเภทการยกเลิก", "ประเภทการคืน"],
  },
  created_at: {
    names: ["createdtime", "createtime", "ordercreatedtime", "ordercreatetime", "createdat", "orderdate", "ordertime", "เวลาที่สร้าง", "เวลาสร้างคำสั่งซื้อ", "วันที่สั่งซื้อ", "created"],
  },
  paid_at: {
    names: ["paidtime", "paymenttime", "paidat", "เวลาที่ชำระเงิน", "เวลาชำระเงิน", "paid"],
    avoid: ["unpaid", "amount", "ยอด"],
  },
  delivered_at: {
    names: ["deliveredtime", "deliverytime", "deliveredat", "เวลาที่จัดส่งสำเร็จ", "เวลาจัดส่งสำเร็จ", "delivered"],
    avoid: ["option", "method", "fee", "ค่า"],
  },
  cancelled_at: {
    names: ["cancelledtime", "canceledtime", "cancellationtime", "cancelledat", "canceledat", "เวลาที่ยกเลิก", "เวลายกเลิก"],
    avoid: ["reason", "type", "เหตุผล", "ประเภท"],
  },
  sku_id: {
    names: ["skuid", "sellersku", "รหัสsku", "skuรหัส", "รหัสสินค้าsku"],
    avoid: ["quantity", "price", "subtotal", "name", "จำนวน", "ราคา", "ชื่อ"],
  },
  sku_name: {
    names: ["productname", "skuname", "itemname", "ชื่อสินค้า", "product", "สินค้า"],
    avoid: ["id", "category", "sku", "หมวด", "รหัส", "ตัวเลือก"],
  },
  variant: {
    names: ["variation", "variant", "variations", "skuvariation", "ตัวเลือกสินค้า", "ตัวเลือก", "รูปแบบสินค้า"],
  },
  quantity: {
    names: ["quantity", "qty", "skuquantity", "จำนวน", "จำนวนสินค้า"],
    avoid: ["return", "refund", "คืน"],
  },
  unit_price: {
    names: ["skuunitoriginalprice", "unitoriginalprice", "unitprice", "originalprice", "ราคาต่อหน่วย", "ราคาสินค้า", "price", "ราคา"],
    avoid: ["return", "refund", "total", "subtotal", "คืน", "รวม"],
  },
  subtotal: {
    names: ["skusubtotalafterdiscount", "subtotalafterdiscount", "skusubtotal", "ยอดรวมย่อยหลังส่วนลด", "ยอดรวมย่อย", "subtotal"],
    avoid: ["before", "return", "refund", "คืน", "ก่อน"],
  },
  order_amount: {
    names: ["orderamount", "ordertotal", "totalamount", "ยอดรวมคำสั่งซื้อ", "ยอดคำสั่งซื้อ", "ยอดรวม"],
    avoid: ["refund", "settlement", "คืน", "ชำระบัญชี", "ย่อย"],
  },
  refund_amount: {
    names: ["orderrefundamount", "refundamount", "ยอดเงินคืน", "จำนวนเงินคืน", "ยอดคืนเงิน", "refundsubtotalaftersellerdiscounts", "refund"],
    avoid: ["quantity", "type", "reason", "time", "จำนวน", "ประเภท", "เหตุผล", "เวลา"],
  },
  seller_received: {
    names: ["totalsettlementamount", "settlementamount", "netsettlement", "sellerreceived", "ยอดชำระบัญชีรวม", "ยอดชำระบัญชี", "ยอดที่ผู้ขายได้รับ", "settlement"],
    avoid: ["date", "time", "currency", "status", "เวลา", "วันที่", "สถานะ"],
  },
  buyer_name: {
    names: ["buyerusername", "buyername", "ชื่อผู้ใช้ผู้ซื้อ", "ชื่อผู้ซื้อ", "username", "buyer", "ผู้ซื้อ", "recipient", "ผู้รับ"],
    avoid: ["message", "note", "ข้อความ"],
  },
  settled_at: {
    names: ["ordersettledtime", "settledtime", "settlementtime", "settlementdate", "statementdate", "settledat", "เวลาที่ชำระบัญชี", "วันที่ชำระบัญชี", "วันที่ใบแจ้งยอด", "settled"],
    avoid: ["amount", "ยอด"],
  },
  statement_type: {
    names: ["type", "transactiontype", "statementtype", "ประเภท", "ประเภทรายการ"],
    avoid: ["cancel", "return", "ยกเลิก", "คืน"],
  },
  payment_id: {
    names: ["paymentid", "payoutid", "withdrawalid", "paymentreferenceid", "รหัสการชำระเงิน", "รหัสการโอนเงิน", "หมายเลขการโอนเงิน", "รหัสการจ่ายเงิน"],
    avoid: ["method", "วิธี"],
  },
  payout_date: {
    names: ["paymenttime", "paymentdate", "payouttime", "payoutdate", "paidtime", "bankpaidtime", "วันที่โอนเงิน", "เวลาที่โอนเงิน", "วันที่จ่ายเงิน", "วันที่เงินเข้าบัญชี"],
    avoid: ["amount", "ยอด"],
  },
  payout_amount: {
    names: ["paymentamount", "payoutamount", "amountpaid", "ยอดโอน", "ยอดเงินที่โอน", "ยอดจ่ายเงิน"],
    avoid: ["date", "time", "วันที่", "เวลา"],
  },
  statement_status: {
    names: ["status", "statementstatus", "settlementstatus", "สถานะ", "สถานะการชำระบัญชี"],
    avoid: ["order", "sub", "คำสั่งซื้อ"],
  },
};

/** Headers TikTok writes that we do not map but still recognise when hunting for the header row. */
const OTHER_KNOWN_HEADERS = [
  "ordersubstatus", "skuid", "sellersku", "skuquantityofreturn", "skusubtotalbeforediscount", "shippedtime", "cancelreason",
  "currency", "totalrevenue", "subtotalaftersellerdiscounts", "totalfees", "statementdate", "paymentmethod", "shippingprovider",
  "trackingid", "สถานะย่อย", "เหตุผลในการยกเลิก", "สกุลเงิน", "รายได้รวม", "ค่าธรรมเนียมรวม", "เวลาที่จัดส่ง",
];

const KNOWN_HEADERS = new Set<string>([
  ...FIELD_KEYS.flatMap((key) => SYNONYMS[key].names),
  ...OTHER_KNOWN_HEADERS,
]);

/** True when the header text is one we know exactly (after normalisation). */
export function isKnownHeader(text: string): boolean {
  return KNOWN_HEADERS.has(normalizeHeader(text));
}

/* ------------------------------------------------------------------ */
/* parseTable                                                          */
/* ------------------------------------------------------------------ */

const XLSX_EXT = /\.(xlsx|xlsm|xlsb)$/i;
const CSV_EXT = /\.(csv|tsv|txt)$/i;

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * CSV (any BOM, comma/semicolon/tab) or XLSX (first sheet with content) to trimmed
 * records keyed by header. Title rows above the header and TikTok's "Please do not
 * edit" note under it are skipped.
 */
export async function parseTable(bytes: Uint8Array, filename: string): Promise<ParsedTable> {
  const isXlsx = XLSX_EXT.test(filename) || (!CSV_EXT.test(filename) && looksLikeZip(bytes));
  let grid: string[][];
  let sheetName: string | null = null;
  if (isXlsx) {
    const read = await readXlsxGrid(bytes);
    grid = read.grid;
    sheetName = read.sheetName;
  } else {
    grid = parseCsv(new TextDecoder("utf-8").decode(bytes));
  }
  let headerRowIndex = findHeaderRow(grid, isKnownHeader);
  if (headerRowIndex < 0) headerRowIndex = grid.findIndex((cells) => cells.some((v) => v.trim().length > 0));
  if (headerRowIndex < 0) return { headers: [], rows: [], headerRowIndex: -1, sheetName };
  const headers = cleanHeaders(grid[headerRowIndex]);
  return { headers, rows: rowsUnder(grid, headerRowIndex, headers), headerRowIndex, sheetName };
}

/* ------------------------------------------------------------------ */
/* detectFileType / detectMapping                                      */
/* ------------------------------------------------------------------ */

function hasHeader(normalized: string[], names: string[], avoid: string[] = []): boolean {
  return normalized.some((h) => names.some((n) => h === n || h.includes(n)) && !avoid.some((a) => h.includes(a)));
}

/** Orders files carry an order status plus SKU or quantity columns; finance files carry settlement columns and no quantity. */
export function detectFileType(headers: string[]): ImportFileType {
  const normalized = headers.map(normalizeHeader);
  const hasStatus = hasHeader(normalized, ["orderstatus", "สถานะคำสั่งซื้อ", "สถานะการสั่งซื้อ"]);
  const hasQuantity = hasHeader(normalized, ["quantity", "qty", "จำนวน"], ["return", "refund", "คืน"]);
  const hasSku = hasHeader(normalized, ["sku", "productname", "ชื่อสินค้า"]);
  const hasSettlement = hasHeader(normalized, ["settle", "settlement", "statement", "ชำระบัญชี", "ใบแจ้งยอด"]);
  if (hasStatus && (hasQuantity || hasSku)) return "orders";
  if (hasSettlement && !hasQuantity) return "finance";
  return "unknown";
}

const ORDER_FIELDS: FieldKey[] = FIELD_KEYS.filter((k) => !["settled_at", "statement_type", "statement_status", "seller_received", "payment_id", "payout_date", "payout_amount"].includes(k));
const FINANCE_FIELDS: FieldKey[] = ["order_id", "statement_type", "created_at", "settled_at", "seller_received", "refund_amount", "statement_status", "payment_id", "payout_date", "payout_amount"];

/**
 * Maps every field we can to one header. Exact matches are taken first across all
 * fields, then contains-matches on whatever is left, so no header serves two fields.
 */
export function detectMapping(headers: string[], fileType: ImportFileType): ColumnMapping {
  const fields = fileType === "orders" ? ORDER_FIELDS : fileType === "finance" ? FINANCE_FIELDS : [...FIELD_KEYS];
  const candidates = headers.map((header, index) => ({ header, index, norm: normalizeHeader(header) }));
  const taken = new Set<number>();
  const mapping: ColumnMapping = {};

  for (const field of fields) {
    for (const name of SYNONYMS[field].names) {
      const hit = candidates.find((c) => !taken.has(c.index) && c.norm === name);
      if (hit) {
        mapping[field] = hit.header;
        taken.add(hit.index);
        break;
      }
    }
  }

  for (const field of fields) {
    if (mapping[field] !== undefined) continue;
    const { names, avoid = [] } = SYNONYMS[field];
    for (const name of names) {
      const hits = candidates
        .filter((c) => !taken.has(c.index) && c.norm.includes(name) && !avoid.some((a) => c.norm.includes(a)))
        .sort((a, b) => a.norm.length - b.norm.length);
      if (hits.length) {
        mapping[field] = hits[0].header;
        taken.add(hits[0].index);
        break;
      }
    }
  }

  // TikTok orders exports never carry what the seller receives; that comes from the finance file.
  if (fileType === "orders") delete mapping.seller_received;
  return mapping;
}

const DATE_FIELDS: FieldKey[] = ["created_at", "paid_at", "delivered_at", "cancelled_at"];

/** Orders need an id, a status, one date and a quantity; finance needs an id, a settled date and the settled amount. */
export function mappingIsUsable(mapping: ColumnMapping, fileType: ImportFileType): { ok: boolean; missing: FieldKey[] } {
  const missing: FieldKey[] = [];
  if (fileType === "orders") {
    if (!mapping.order_id) missing.push("order_id");
    if (!mapping.order_status) missing.push("order_status");
    if (!DATE_FIELDS.some((f) => mapping[f])) missing.push("created_at");
    if (!mapping.quantity) missing.push("quantity");
  } else if (fileType === "finance") {
    if (!mapping.order_id) missing.push("order_id");
    if (!mapping.settled_at) missing.push("settled_at");
    if (!mapping.seller_received) missing.push("seller_received");
  } else {
    missing.push("order_id");
  }
  return { ok: missing.length === 0, missing };
}

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

/** "฿1,234.50", "(120)", "-120 บาท", "THB 99" -> a number; empty or unreadable -> null. */
export function parseMoney(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  let s = thaiDigitsToArabic(String(text)).replace(/฿|thb|บาท|[\s ,]/gi, "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type ImportedOrderStatus = "active" | "cancelled" | "refunded" | "unknown";

export type ImportedOrderLine = { sku_id?: string; sku_name: string; variant: string; quantity: number; unit_price: number | null; subtotal: number | null };

export type ImportedOrder = {
  order_id: string;
  status: ImportedOrderStatus;
  raw_status: string;
  created_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  buyer_name: string | null;
  lines: ImportedOrderLine[];
  quantity: number;
  order_amount: number | null;
  refund_amount: number | null;
  seller_received: number | null;
  row_numbers: number[];
};

const REFUND_WORDS = ["refund", "return", "คืนเงิน", "คืนสินค้า"];
const CANCEL_WORDS = ["cancel", "ยกเลิก"];
const ACTIVE_WORDS = [
  "completed", "complete", "delivered", "shipped", "to ship", "toship", "awaiting shipment", "awaiting collection", "in transit", "intransit",
  "unpaid", "paid", "processing", "จัดส่งแล้ว", "เสร็จสิ้น", "สำเร็จ", "ที่ต้องจัดส่ง", "รอจัดส่ง", "กำลังจัดส่ง", "ยังไม่ชำระ", "รอการชำระเงิน", "ชำระแล้ว",
];

function hasWord(text: string, words: string[]): boolean {
  const lowered = text.toLowerCase();
  return words.some((w) => lowered.includes(w));
}

/** TikTok status wording, in English or Thai, to our four buckets. */
export function statusFromText(status: string, cancelType = ""): ImportedOrderStatus {
  if (hasWord(cancelType, REFUND_WORDS) || hasWord(status, REFUND_WORDS)) return "refunded";
  if (hasWord(status, CANCEL_WORDS) || hasWord(cancelType, CANCEL_WORDS)) return "cancelled";
  if (hasWord(status, ACTIVE_WORDS)) return "active";
  return "unknown";
}

const RETURN_QTY_NAMES = ["skuquantityofreturn", "quantityofreturn", "returnquantity", "returnedquantity", "จำนวนที่คืน", "จำนวนสินค้าที่คืน"];

/** The "Sku Quantity of return" column is not a mapped field, so look for it by name. */
function findReturnQuantityHeader(rows: Record<string, string>[]): string | null {
  const first = rows[0];
  if (!first) return null;
  return Object.keys(first).find((h) => RETURN_QTY_NAMES.includes(normalizeHeader(h))) ?? null;
}

function cell(row: Record<string, string>, mapping: ColumnMapping, field: FieldKey): string {
  const header = mapping[field];
  return header === undefined ? "" : (row[header] ?? "").trim();
}

function firstDate(rows: Record<string, string>[], mapping: ColumnMapping, field: FieldKey): string | null {
  for (const row of rows) {
    const iso = normalizeDate(cell(row, mapping, field));
    if (iso) return iso;
  }
  return null;
}

function firstMoney(rows: Record<string, string>[], mapping: ColumnMapping, field: FieldKey): number | null {
  for (const row of rows) {
    const n = parseMoney(cell(row, mapping, field));
    if (n !== null) return n;
  }
  return null;
}

function firstText(rows: Record<string, string>[], mapping: ColumnMapping, field: FieldKey): string | null {
  for (const row of rows) {
    const s = cell(row, mapping, field);
    if (s) return s;
  }
  return null;
}

/** Groups SKU rows by order id, one ImportedOrder per order, in first-seen order. */
export function ordersFromRows(rows: Record<string, string>[], mapping: ColumnMapping): ImportedOrder[] {
  const groups = new Map<string, { rows: Record<string, string>[]; numbers: number[] }>();
  rows.forEach((row, i) => {
    const id = cell(row, mapping, "order_id");
    if (!id) return;
    const group = groups.get(id) ?? { rows: [], numbers: [] };
    group.rows.push(row);
    group.numbers.push(i + 1);
    groups.set(id, group);
  });

  const returnHeader = findReturnQuantityHeader(rows);
  const orders: ImportedOrder[] = [];
  for (const [order_id, group] of groups) {
    const lines: ImportedOrderLine[] = group.rows.map((row) => ({
      ...(cell(row, mapping, "sku_id") ? { sku_id: cell(row, mapping, "sku_id") } : {}),
      sku_name: cell(row, mapping, "sku_name"),
      variant: cell(row, mapping, "variant"),
      quantity: parseMoney(cell(row, mapping, "quantity")) ?? 0,
      unit_price: parseMoney(cell(row, mapping, "unit_price")),
      subtotal: parseMoney(cell(row, mapping, "subtotal")),
    }));
    const quantity = lines.reduce((sum, l) => sum + l.quantity, 0);

    const raw_status = firstText(group.rows, mapping, "order_status") ?? "";
    let status = statusFromText(raw_status, firstText(group.rows, mapping, "cancel_type") ?? "");
    if (returnHeader && quantity > 0) {
      const returned = group.rows.reduce((sum, row) => sum + (parseMoney(row[returnHeader]) ?? 0), 0);
      if (returned >= quantity) status = "refunded";
    }

    const subtotals = lines.map((l) => l.subtotal).filter((v): v is number => v !== null);
    const order_amount = firstMoney(group.rows, mapping, "order_amount") ?? (subtotals.length ? round2(subtotals.reduce((a, b) => a + b, 0)) : null);

    orders.push({
      order_id,
      status,
      raw_status,
      created_at: firstDate(group.rows, mapping, "created_at"),
      paid_at: firstDate(group.rows, mapping, "paid_at"),
      delivered_at: firstDate(group.rows, mapping, "delivered_at"),
      cancelled_at: firstDate(group.rows, mapping, "cancelled_at"),
      buyer_name: firstText(group.rows, mapping, "buyer_name"),
      lines,
      quantity,
      order_amount,
      refund_amount: firstMoney(group.rows, mapping, "refund_amount"),
      seller_received: firstMoney(group.rows, mapping, "seller_received"),
      row_numbers: group.numbers,
    });
  }
  return orders;
}

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

export type ImportedSettlement = {
  order_id: string | null;
  type: "order" | "adjustment" | "other";
  raw_type: string;
  settled_at: string | null;
  amount: number;
  status: string;
  /** The payout that carried this row, when the file says: id, day and total. */
  payment_id: string | null;
  payout_date: string | null;
  payout_amount: number | null;
  row_number: number;
};

function settlementType(raw: string): ImportedSettlement["type"] {
  if (hasWord(raw, ["adjustment", "ปรับปรุง"])) return "adjustment";
  if (hasWord(raw, ["order", "คำสั่งซื้อ"])) return "order";
  return "other";
}

/** One settlement per finance row; rows with neither an id nor an amount are skipped. */
export function settlementsFromRows(rows: Record<string, string>[], mapping: ColumnMapping): ImportedSettlement[] {
  const out: ImportedSettlement[] = [];
  rows.forEach((row, i) => {
    const id = cell(row, mapping, "order_id");
    const amount = parseMoney(cell(row, mapping, "seller_received"));
    if (!id && amount === null) return;
    const raw_type = cell(row, mapping, "statement_type");
    out.push({
      order_id: id || null,
      type: settlementType(raw_type),
      raw_type,
      settled_at: normalizeDate(cell(row, mapping, "settled_at")),
      amount: amount ?? 0,
      status: cell(row, mapping, "statement_status"),
      payment_id: cell(row, mapping, "payment_id") || null,
      payout_date: normalizeDate(cell(row, mapping, "payout_date")),
      payout_amount: parseMoney(cell(row, mapping, "payout_amount")),
      row_number: i + 1,
    });
  });
  return out;
}
