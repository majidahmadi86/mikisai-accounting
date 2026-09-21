import ExcelJS from "exceljs";

/**
 * Turns an uploaded CSV or XLSX into a plain grid of strings, then finds the
 * header row inside it. Nothing here knows about TikTok; the caller says which
 * header texts it recognises.
 */

export type Grid = string[][];

const DELIMITERS = [",", ";", "\t"] as const;

/** Picks the delimiter that appears most often outside quotes on the first non-empty line. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  let best = ",";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === d) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 style parsing: quoted fields may hold the delimiter, newlines and doubled quotes. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Excel dates come back as UTC Date objects; render them the way TikTok writes them. */
function renderDate(d: Date): string {
  const date = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds();
  return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : date;
}

/** Any exceljs cell value as plain text. Numbers keep their full digits, dates become dd/mm/yyyy. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return renderDate(value);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return typeof value.text === "string" ? value.text : cellText(value.text as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return String(value);
}

/** Reads the first worksheet that has any content. */
/** Every sheet of a workbook as a grid, keyed by sheet name. The TikTok Finance statement spreads over several sheets. */
export async function readXlsxSheets(bytes: Uint8Array): Promise<Record<string, Grid>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const out: Record<string, Grid> = {};
  for (const sheet of workbook.worksheets) {
    const grid: Grid = [];
    let width = 0;
    sheet.eachRow((row) => {
      width = Math.max(width, row.cellCount);
    });
    for (let r = 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= width; c += 1) cells.push(cellText(row.getCell(c).value));
      grid.push(cells);
    }
    out[sheet.name] = grid;
  }
  return out;
}

export async function readXlsxGrid(bytes: Uint8Array): Promise<{ grid: Grid; sheetName: string | null }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  for (const sheet of workbook.worksheets) {
    const grid: Grid = [];
    let width = 0;
    sheet.eachRow((row) => {
      width = Math.max(width, row.cellCount);
    });
    for (let r = 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= width; c += 1) cells.push(cellText(row.getCell(c).value));
      grid.push(cells);
    }
    if (grid.some((cells) => cells.some((v) => v.trim().length > 0))) return { grid, sheetName: sheet.name };
  }
  return { grid: [], sheetName: workbook.worksheets[0]?.name ?? null };
}

const NOTE_PREFIXES = ["please", "กรุณา"];

/** The first row whose non-empty cells include at least `minKnown` recognised headers, or -1. */
export function findHeaderRow(grid: Grid, isKnownHeader: (text: string) => boolean, minKnown = 3): number {
  for (let i = 0; i < grid.length; i += 1) {
    const known = grid[i].filter((cell) => cell.trim().length > 0 && isKnownHeader(cell)).length;
    if (known >= minKnown) return i;
  }
  return -1;
}

/** Unique, non-empty header names; blanks get a column number and duplicates a suffix. */
export function cleanHeaders(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, i) => {
    const base = cell.trim() || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Rows under the header become records; blank rows and "Please do not edit" notes are dropped. */
export function rowsUnder(grid: Grid, headerRowIndex: number, headers: string[]): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i += 1) {
    const cells = grid[i].map((v) => v.trim());
    const first = cells.find((v) => v.length > 0);
    if (first === undefined) continue;
    const lowered = first.toLowerCase();
    if (NOTE_PREFIXES.some((p) => lowered.startsWith(p))) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, c) => {
      record[h] = cells[c] ?? "";
    });
    out.push(record);
  }
  return out;
}
