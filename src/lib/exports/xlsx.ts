import ExcelJS from "exceljs";
import type { ExportTable } from "./tables";

/** Brand colours as ARGB for Excel fills. */
export const XLSX_COLORS = {
  plum: "FF302333",
  berry: "FF8F315F",
  ivory: "FFFAF7F2",
  ivoryDeep: "FFF2ECE4",
  lavender: "FFC9B8E8",
  white: "FFFFFFFF",
};

const MONEY_FORMAT = '"฿"#,##0.00;[Red]-"฿"#,##0.00';
const PCT_FORMAT = '0.00"%"';

function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type WorkbookMeta = { title: string; periodLabel: string; generatedBy: string; generatedAt: string; brand?: string };

/**
 * Writes one sheet per table. Headers are plum with ivory text, body rows
 * alternate ivory stripes, and totals are real SUM formulas so the numbers
 * still add up if someone edits a cell.
 */
export function addTableSheet(workbook: ExcelJS.Workbook, table: ExportTable, meta: WorkbookMeta): ExcelJS.Worksheet {
  const name = table.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || table.id;
  const sheet = workbook.addWorksheet(name, { views: [{ showGridLines: false }] });

  // Title block
  sheet.mergeCells(1, 1, 1, Math.max(2, table.columns.length));
  const title = sheet.getCell(1, 1);
  title.value = `${meta.brand ?? "MIKISAI"} · ${table.title}`;
  title.font = { name: "Georgia", size: 16, bold: true, color: { argb: XLSX_COLORS.plum } };
  sheet.getRow(1).height = 26;
  sheet.mergeCells(2, 1, 2, Math.max(2, table.columns.length));
  const sub = sheet.getCell(2, 1);
  sub.value = [table.description, meta.periodLabel, `${meta.generatedBy} · ${meta.generatedAt}`].filter(Boolean).join("  ·  ");
  sub.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF6B5E70" } };

  const headerRowIndex = 4;
  const header = sheet.getRow(headerRowIndex);
  table.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: XLSX_COLORS.ivory } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_COLORS.plum } };
    cell.alignment = { vertical: "middle", horizontal: c.kind === "text" || c.kind === "date" ? "left" : "right" };
    cell.border = { bottom: { style: "thin", color: { argb: XLSX_COLORS.berry } } };
  });
  header.height = 20;

  table.rows.forEach((row, r) => {
    const excelRow = sheet.getRow(headerRowIndex + 1 + r);
    row.forEach((value, c) => {
      const cell = excelRow.getCell(c + 1);
      const kind = table.columns[c].kind;
      cell.value = value;
      if (kind === "money") cell.numFmt = MONEY_FORMAT;
      if (kind === "pct") cell.numFmt = PCT_FORMAT;
      if (kind === "int") cell.numFmt = "0";
      cell.alignment = { horizontal: kind === "text" || kind === "date" ? "left" : "right" };
      cell.font = { name: "Calibri", size: 10, color: { argb: XLSX_COLORS.plum } };
      if (r % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_COLORS.ivoryDeep } };
    });
  });

  if (table.totals.length && table.rows.length) {
    const first = headerRowIndex + 1;
    const last = headerRowIndex + table.rows.length;
    const totalRow = sheet.getRow(last + 1);
    totalRow.getCell(1).value = table.totalLabel;
    totalRow.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: XLSX_COLORS.plum } };
    for (const c of table.totals) {
      const cell = totalRow.getCell(c + 1);
      const letter = colLetter(c);
      cell.value = { formula: `SUM(${letter}${first}:${letter}${last})` };
      const kind = table.columns[c].kind;
      cell.numFmt = kind === "money" ? MONEY_FORMAT : kind === "pct" ? PCT_FORMAT : "0";
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: XLSX_COLORS.berry } };
      cell.alignment = { horizontal: "right" };
    }
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: "thin", color: { argb: XLSX_COLORS.plum } } };
    });
  }

  table.columns.forEach((c, i) => {
    const longest = Math.max(c.label.length, ...table.rows.map((r) => String(r[i] ?? "").length));
    sheet.getColumn(i + 1).width = Math.min(48, Math.max(12, longest + 4));
  });
  sheet.getRow(headerRowIndex).alignment = { vertical: "middle" };
  return sheet;
}

export async function buildWorkbook(tables: ExportTable[], meta: WorkbookMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.generatedBy;
  workbook.created = new Date();
  for (const table of tables) addTableSheet(workbook, table, meta);
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/** Reads numbers back from a workbook buffer. Used by tests to prove the export matches the screen. */
export async function readSheetValues(buffer: Buffer, sheetIndex = 0): Promise<{ header: string[]; rows: (string | number | null)[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[sheetIndex];
  const header: string[] = [];
  sheet.getRow(4).eachCell((cell, col) => {
    header[col - 1] = String(cell.value ?? "");
  });
  const rows: (string | number | null)[][] = [];
  for (let r = 5; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const values: (string | number | null)[] = [];
    let any = false;
    for (let c = 1; c <= header.length; c += 1) {
      const v = row.getCell(c).value;
      if (v === null || v === undefined) {
        values.push(null);
        continue;
      }
      any = true;
      if (typeof v === "object" && "formula" in v) values.push(`=${v.formula}`);
      else if (typeof v === "object" && "richText" in v) values.push(v.richText.map((t) => t.text).join(""));
      else values.push(v as string | number);
    }
    if (any) rows.push(values);
  }
  return { header, rows };
}
