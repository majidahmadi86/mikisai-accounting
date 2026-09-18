import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  detectFileType,
  detectMapping,
  mappingIsUsable,
  normalizeDate,
  ordersFromRows,
  parseMoney,
  parseTable,
  settlementsFromRows,
} from "@/lib/import/tiktok";

/* Fixtures are built here so no binary files live in the repo. */

const ORDER_HEADERS = [
  "Order ID", "Order Status", "Order Substatus", "Cancelation/Return Type", "SKU ID", "Seller SKU", "Product Name", "Variation",
  "Quantity", "Sku Quantity of return", "SKU Unit Original Price", "SKU Subtotal Before Discount", "SKU Subtotal After Discount",
  "Order Amount", "Order Refund Amount", "Created Time", "Paid Time", "Shipped Time", "Delivered Time", "Cancelled Time",
  "Cancel Reason", "Buyer Username", "Recipient",
];

type Row = Record<string, string>;

function orderRow(over: Row): string[] {
  const base: Row = {
    "Order ID": "", "Order Status": "Completed", "Order Substatus": "", "Cancelation/Return Type": "", "SKU ID": "1", "Seller SKU": "S",
    "Product Name": "Serum", "Variation": "30ml", "Quantity": "1", "Sku Quantity of return": "0", "SKU Unit Original Price": "THB 100",
    "SKU Subtotal Before Discount": "100", "SKU Subtotal After Discount": "90", "Order Amount": "", "Order Refund Amount": "0",
    "Created Time": "18/09/2026 21:10:33", "Paid Time": "18/09/2026 21:12:00", "Shipped Time": "", "Delivered Time": "", "Cancelled Time": "",
    "Cancel Reason": "", "Buyer Username": "mike_b", "Recipient": "Mike",
  };
  return ORDER_HEADERS.map((h) => over[h] ?? base[h]);
}

function csvLine(cells: string[], delimiter = ","): string {
  return cells.map((c) => (/[",\n;\t]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(delimiter);
}

function toBytes(text: string, bom = false): Uint8Array {
  return new TextEncoder().encode(bom ? `﻿${text}` : text);
}

const ORDERS_CSV = [
  csvLine(ORDER_HEADERS),
  csvLine(orderRow({ "Order ID": "A1", "Product Name": "Serum, 30ml", "Quantity": "1", "SKU Subtotal After Discount": "90", "Order Amount": "270" })),
  csvLine(orderRow({ "Order ID": "A1", "Product Name": "Toner", "Variation": "Large", "Quantity": "2", "SKU Subtotal After Discount": "180", "Order Amount": "270" })),
  csvLine(orderRow({ "Order ID": "B2", "Order Status": "Cancelled", "Cancelled Time": "19/09/2026 08:00:00", "Cancel Reason": "Changed mind" })),
  csvLine(orderRow({ "Order ID": "C3", "Order Status": "Completed", "Cancelation/Return Type": "Return/Refund", "Sku Quantity of return": "1", "Order Refund Amount": "฿90.00", "Delivered Time": "20/09/2026 10:00:00" })),
  csvLine(orderRow({ "Order ID": "D4", "Order Status": "To ship", "Quantity": "5", "Sku Quantity of return": "" })),
].join("\r\n");

const FINANCE_HEADERS = [
  "Order/adjustment ID", "Order ID", "Type", "Order created time", "Order settled time", "Statement date", "Currency",
  "Total settlement amount", "Total revenue", "Subtotal after seller discounts", "Refund subtotal after seller discounts", "Total fees", "Status",
];

const FINANCE_CSV = [
  csvLine(FINANCE_HEADERS),
  csvLine(["A1", "A1", "Order", "18/09/2026 21:10:33", "21/09/2026 03:00:00", "21/09/2026", "THB", "251.40", "270", "270", "0", "-18.60", "Settled"]),
  csvLine(["ADJ-9", "", "Adjustment", "", "22/09/2026 03:00:00", "22/09/2026", "THB", "-35.00", "0", "0", "0", "-35.00", "Settled"]),
  csvLine(["C3", "C3", "Order", "18/09/2026 09:00:00", "23/09/2026 03:00:00", "23/09/2026", "THB", "(90.00)", "90", "90", "-90", "0", "Settled"]),
].join("\n");

const THAI_HEADERS = ["หมายเลขคำสั่งซื้อ", "สถานะคำสั่งซื้อ", "ชื่อสินค้า", "ตัวเลือกสินค้า", "จำนวน", "ยอดรวมคำสั่งซื้อ", "เวลาที่สร้าง", "เวลาที่ชำระเงิน", "เวลาที่จัดส่งสำเร็จ", "เวลาที่ยกเลิก", "ชื่อผู้ใช้ผู้ซื้อ", "ผู้รับ"];

const THAI_CSV = [
  csvLine(THAI_HEADERS, ";"),
  csvLine(["T1", "เสร็จสิ้น", "เซรั่ม", "30ml", "2", "1,200.00 บาท", "18/09/2569 21:10:33", "18/09/2569", "20 ก.ย. 2569", "", "somchai", "สมชาย"], ";"),
  csvLine(["T2", "ยกเลิก", "โทนเนอร์", "", "1", "๓๐๐", "๑๘/๐๙/๒๕๖๙", "", "", "19/09/69", "malee", "มาลี"], ";"),
].join("\n");

async function ordersXlsx(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Orders");
  sheet.addRow(["TikTok Shop order export", null, null]);
  sheet.addRow([]);
  sheet.addRow(ORDER_HEADERS);
  sheet.addRow(["Please do not edit this row"]);
  const created = new Date(Date.UTC(2026, 8, 18, 21, 10, 33));
  const one = orderRow({ "Order ID": "X1", "Quantity": "1", "Order Amount": "150" }).map((v, i) => {
    const h = ORDER_HEADERS[i];
    if (h === "Created Time" || h === "Paid Time") return created;
    if (h === "Quantity" || h === "Order Amount" || h === "SKU Subtotal After Discount") return Number(v);
    if (h === "Product Name") return { richText: [{ text: "Rich " }, { text: "Serum", font: { bold: true } }] };
    return v;
  });
  sheet.addRow(one);
  const two = orderRow({ "Order ID": "X1", "Product Name": "Toner", "Quantity": "2", "Order Amount": "150" }).map((v, i) => {
    const h = ORDER_HEADERS[i];
    if (h === "Created Time" || h === "Paid Time") return created;
    if (h === "Quantity" || h === "Order Amount") return Number(v);
    return v;
  });
  sheet.addRow(two);
  sheet.addRow([]);
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

describe("parseTable", () => {
  it("reads a BOM CSV with quoted commas and trims every value", async () => {
    const table = await parseTable(toBytes(ORDERS_CSV, true), "orders.csv");
    expect(table.headerRowIndex).toBe(0);
    expect(table.sheetName).toBeNull();
    expect(table.headers[0]).toBe("Order ID");
    expect(table.rows).toHaveLength(5);
    expect(table.rows[0]["Product Name"]).toBe("Serum, 30ml");
    expect(table.rows[0]["Order ID"]).toBe("A1");
  });

  it("finds the header under a title row in xlsx and skips the Please-do-not-edit note", async () => {
    const table = await parseTable(await ordersXlsx(), "orders.xlsx");
    expect(table.sheetName).toBe("Orders");
    expect(table.headerRowIndex).toBe(2);
    expect(table.headers).toEqual(ORDER_HEADERS);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]["Created Time"]).toBe("18/09/2026 21:10:33");
    expect(table.rows[0]["Quantity"]).toBe("1");
    expect(table.rows[0]["Order Amount"]).toBe("150");
    expect(table.rows[0]["Product Name"]).toBe("Rich Serum");
  });

  it("auto-detects a semicolon delimiter and keeps Thai headers intact", async () => {
    const table = await parseTable(toBytes(THAI_CSV), "orders-th.csv");
    expect(table.headers).toEqual(THAI_HEADERS);
    expect(table.rows[0]["ชื่อสินค้า"]).toBe("เซรั่ม");
  });

  it("handles embedded newlines inside quotes and tab delimiters", async () => {
    const text = `Order ID\tOrder Status\tQuantity\tProduct Name\n1\tCompleted\t2\t"Two\nlines"\n`;
    const table = await parseTable(toBytes(text), "x.tsv");
    expect(table.rows).toEqual([{ "Order ID": "1", "Order Status": "Completed", "Quantity": "2", "Product Name": "Two\nlines" }]);
  });
});

describe("normalizeDate", () => {
  it("reads the shapes TikTok and Excel produce", () => {
    expect(normalizeDate("18/09/2026 21:10:33")).toBe("2026-09-18");
    expect(normalizeDate("2026-09-18")).toBe("2026-09-18");
    expect(normalizeDate("2569-09-18 10:00")).toBe("2026-09-18");
    expect(normalizeDate("18/09/2569")).toBe("2026-09-18");
    expect(normalizeDate("18 ก.ย. 2569")).toBe("2026-09-18");
    expect(normalizeDate("18 กันยายน 2569")).toBe("2026-09-18");
    expect(normalizeDate("18 Sep 2026")).toBe("2026-09-18");
    expect(normalizeDate("Sep 18, 2026")).toBe("2026-09-18");
    expect(normalizeDate("18/09/69")).toBe("2026-09-18");
    expect(normalizeDate("18/09/26")).toBe("2026-09-18");
    expect(normalizeDate("๑๘/๐๙/๒๕๖๙")).toBe("2026-09-18");
    expect(normalizeDate("45918")).toBe("2025-09-18");
    expect(normalizeDate("09/18/2026")).toBeNull();
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate("not a date")).toBeNull();
  });
});

describe("parseMoney", () => {
  it("strips currency marks and reads negatives", () => {
    expect(parseMoney("฿1,234.50")).toBe(1234.5);
    expect(parseMoney("THB 99")).toBe(99);
    expect(parseMoney("1,200.00 บาท")).toBe(1200);
    expect(parseMoney("(120)")).toBe(-120);
    expect(parseMoney("-35.00")).toBe(-35);
    expect(parseMoney("๓๐๐")).toBe(300);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});

describe("detectFileType and detectMapping", () => {
  it("tells the orders export from the finance statement", () => {
    expect(detectFileType(ORDER_HEADERS)).toBe("orders");
    expect(detectFileType(FINANCE_HEADERS)).toBe("finance");
    expect(detectFileType(THAI_HEADERS)).toBe("orders");
    expect(detectFileType(["รหัสคำสั่งซื้อ/การปรับปรุง", "ประเภท", "เวลาที่ชำระบัญชี", "ยอดชำระบัญชีรวม", "สถานะ"])).toBe("finance");
    expect(detectFileType(["Name", "Email"])).toBe("unknown");
  });

  it("maps the English orders headers by meaning, one header per field", () => {
    const m = detectMapping(ORDER_HEADERS, "orders");
    expect(m).toMatchObject({
      order_id: "Order ID",
      order_status: "Order Status",
      cancel_type: "Cancelation/Return Type",
      created_at: "Created Time",
      paid_at: "Paid Time",
      delivered_at: "Delivered Time",
      cancelled_at: "Cancelled Time",
      sku_name: "Product Name",
      variant: "Variation",
      quantity: "Quantity",
      unit_price: "SKU Unit Original Price",
      subtotal: "SKU Subtotal After Discount",
      order_amount: "Order Amount",
      refund_amount: "Order Refund Amount",
      buyer_name: "Buyer Username",
    });
    expect(m.seller_received).toBeUndefined();
    const used = Object.values(m);
    expect(new Set(used).size).toBe(used.length);
  });

  it("maps Thai orders headers and the finance headers", () => {
    const th = detectMapping(THAI_HEADERS, "orders");
    expect(th).toMatchObject({
      order_id: "หมายเลขคำสั่งซื้อ", order_status: "สถานะคำสั่งซื้อ", sku_name: "ชื่อสินค้า", variant: "ตัวเลือกสินค้า", quantity: "จำนวน",
      order_amount: "ยอดรวมคำสั่งซื้อ", created_at: "เวลาที่สร้าง", paid_at: "เวลาที่ชำระเงิน", delivered_at: "เวลาที่จัดส่งสำเร็จ",
      cancelled_at: "เวลาที่ยกเลิก", buyer_name: "ชื่อผู้ใช้ผู้ซื้อ",
    });
    const fin = detectMapping(FINANCE_HEADERS, "finance");
    expect(fin).toMatchObject({
      order_id: "Order ID", statement_type: "Type", created_at: "Order created time", settled_at: "Order settled time",
      seller_received: "Total settlement amount", refund_amount: "Refund subtotal after seller discounts", statement_status: "Status",
    });
    const finTh = detectMapping(["รหัสคำสั่งซื้อ/การปรับปรุง", "ประเภท", "เวลาที่ชำระบัญชี", "ยอดชำระบัญชีรวม", "สถานะ"], "finance");
    expect(finTh).toMatchObject({ order_id: "รหัสคำสั่งซื้อ/การปรับปรุง", statement_type: "ประเภท", settled_at: "เวลาที่ชำระบัญชี", seller_received: "ยอดชำระบัญชีรวม", statement_status: "สถานะ" });
  });

  it("still maps a renamed header such as 'Order id ' and keeps the exact text", () => {
    const m = detectMapping(["Order id ", "Order status", "Qty", "Product name", "Created time"], "orders");
    expect(m.order_id).toBe("Order id ");
    expect(m.order_status).toBe("Order status");
    expect(m.quantity).toBe("Qty");
    expect(m.sku_name).toBe("Product name");
    expect(m.created_at).toBe("Created time");
  });

  it("does not map the return quantity or the before-discount subtotal as the line values", () => {
    const m = detectMapping(["Order ID", "Order Status", "Sku Quantity of return", "SKU Subtotal Before Discount", "Created Time"], "orders");
    expect(m.quantity).toBeUndefined();
    expect(m.subtotal).toBeUndefined();
  });
});

describe("mappingIsUsable", () => {
  it("reports the missing fields per file type", () => {
    expect(mappingIsUsable(detectMapping(ORDER_HEADERS, "orders"), "orders")).toEqual({ ok: true, missing: [] });
    expect(mappingIsUsable(detectMapping(FINANCE_HEADERS, "finance"), "finance")).toEqual({ ok: true, missing: [] });
    expect(mappingIsUsable({ order_id: "Order ID" }, "orders")).toEqual({ ok: false, missing: ["order_status", "created_at", "quantity"] });
    expect(mappingIsUsable({ order_id: "Order ID", order_status: "Order Status", paid_at: "Paid Time", quantity: "Quantity" }, "orders").ok).toBe(true);
    expect(mappingIsUsable({ order_id: "Order ID" }, "finance")).toEqual({ ok: false, missing: ["settled_at", "seller_received"] });
    expect(mappingIsUsable({}, "unknown").ok).toBe(false);
  });
});

describe("ordersFromRows", () => {
  it("merges a two-line order, maps cancelled and refunded statuses, and keeps row numbers", async () => {
    const table = await parseTable(toBytes(ORDERS_CSV, true), "orders.csv");
    const orders = ordersFromRows(table.rows, detectMapping(table.headers, "orders"));
    expect(orders.map((o) => o.order_id)).toEqual(["A1", "B2", "C3", "D4"]);

    const a1 = orders[0];
    expect(a1.status).toBe("active");
    expect(a1.raw_status).toBe("Completed");
    expect(a1.quantity).toBe(3);
    expect(a1.lines).toHaveLength(2);
    expect(a1.lines[0]).toEqual({ sku_name: "Serum, 30ml", variant: "30ml", quantity: 1, unit_price: 100, subtotal: 90 });
    expect(a1.lines[1].variant).toBe("Large");
    expect(a1.order_amount).toBe(270);
    expect(a1.refund_amount).toBe(0);
    expect(a1.seller_received).toBeNull();
    expect(a1.created_at).toBe("2026-09-18");
    expect(a1.paid_at).toBe("2026-09-18");
    expect(a1.delivered_at).toBeNull();
    expect(a1.buyer_name).toBe("mike_b");
    expect(a1.row_numbers).toEqual([1, 2]);

    const b2 = orders[1];
    expect(b2.status).toBe("cancelled");
    expect(b2.cancelled_at).toBe("2026-09-19");
    expect(b2.row_numbers).toEqual([3]);

    const c3 = orders[2];
    expect(c3.status).toBe("refunded");
    expect(c3.refund_amount).toBe(90);
    expect(c3.delivered_at).toBe("2026-09-20");

    expect(orders[3].status).toBe("active");
    expect(orders[3].quantity).toBe(5);
  });

  it("sums subtotals when there is no order amount column and reads Thai statuses and dates", async () => {
    const table = await parseTable(toBytes(THAI_CSV), "orders-th.csv");
    const mapping = detectMapping(table.headers, "orders");
    const orders = ordersFromRows(table.rows, mapping);
    expect(orders[0]).toMatchObject({ order_id: "T1", status: "active", quantity: 2, order_amount: 1200, created_at: "2026-09-18", paid_at: "2026-09-18", delivered_at: "2026-09-20", buyer_name: "somchai" });
    expect(orders[1]).toMatchObject({ order_id: "T2", status: "cancelled", order_amount: 300, created_at: "2026-09-18", cancelled_at: "2026-09-19" });

    const noAmount = ordersFromRows(
      [
        { id: "Z", st: "Delivered", q: "1", sub: "40.50" },
        { id: "Z", st: "Delivered", q: "1", sub: "9.75" },
      ],
      { order_id: "id", order_status: "st", quantity: "q", subtotal: "sub" },
    );
    expect(noAmount[0].order_amount).toBe(50.25);
    expect(noAmount[0].quantity).toBe(2);
  });

  it("marks an order refunded when the whole quantity came back, and unknown for wording it has never seen", async () => {
    const table = await parseTable(await ordersXlsx(), "orders.xlsx");
    const mapping = detectMapping(table.headers, "orders");
    const [x1] = ordersFromRows(table.rows, mapping);
    expect(x1.status).toBe("active");
    expect(x1.quantity).toBe(3);
    expect(x1.order_amount).toBe(150);

    const returned = table.rows.map((r) => ({ ...r, "Sku Quantity of return": r["Quantity"] }));
    expect(ordersFromRows(returned, mapping)[0].status).toBe("refunded");

    const odd = ordersFromRows([{ ...table.rows[0], "Order Status": "Mystery" }], mapping);
    expect(odd[0].status).toBe("unknown");
    expect(odd[0].raw_status).toBe("Mystery");
  });
});

describe("settlementsFromRows", () => {
  it("reads settled orders and a negative adjustment", async () => {
    const table = await parseTable(toBytes(FINANCE_CSV), "finance.csv");
    expect(detectFileType(table.headers)).toBe("finance");
    const mapping = detectMapping(table.headers, "finance");
    const rows = settlementsFromRows(table.rows, mapping);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ order_id: "A1", type: "order", raw_type: "Order", settled_at: "2026-09-21", amount: 251.4, status: "Settled", row_number: 1 });
    expect(rows[1]).toEqual({ order_id: null, type: "adjustment", raw_type: "Adjustment", settled_at: "2026-09-22", amount: -35, status: "Settled", row_number: 2 });
    expect(rows[2].amount).toBe(-90);
    expect(rows[2].order_id).toBe("C3");
  });

  it("uses Thai type wording and skips blank rows", () => {
    const rows = settlementsFromRows(
      [
        { id: "1", t: "คำสั่งซื้อ", d: "18/09/2569", amt: "100" },
        { id: "", t: "", d: "", amt: "" },
        { id: "", t: "การปรับปรุง", d: "19/09/2569", amt: "-5" },
        { id: "9", t: "Withdrawal", d: "", amt: "0" },
      ],
      { order_id: "id", statement_type: "t", settled_at: "d", seller_received: "amt" },
    );
    expect(rows.map((r) => [r.type, r.amount, r.row_number])).toEqual([["order", 100, 1], ["adjustment", -5, 3], ["other", 0, 4]]);
    expect(rows[0].settled_at).toBe("2026-09-18");
  });
});
