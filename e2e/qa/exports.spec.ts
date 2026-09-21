/**
 * Every report export, opened and compared with the screen: each XLSX body
 * row must equal the on-screen table row cell for cell (same formatting
 * rules), each PDF must parse and contain the report title and its headline
 * figure. Runs at 1440px where the tables render as real tables.
 */
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { formatCell } from "../../src/lib/exports/format";
import { check, login, setLang, VIEWPORTS } from "./helpers";

test.use({ viewport: VIEWPORTS.desktop });

const REPORTS: { id: string; title: string }[] = [
  { id: "pl", title: "Profit and loss" },
  { id: "cashflow", title: "Cash flow" },
  { id: "balance", title: "Balance sheet" },
  { id: "product", title: "Sales by product" },
  { id: "platform", title: "Sales by platform" },
  { id: "category", title: "Payments by category" },
  { id: "settlement", title: "Where the money is" },
  { id: "owes", title: "Who owes whom" },
  { id: "customers", title: "Customers" },
  { id: "stock", title: "Stock on hand" },
  { id: "lowstock", title: "Low stock" },
  { id: "profit", title: "Product profitability" },
  { id: "plan", title: "Planned vs actual margin" },
  { id: "samples", title: "Samples given" },
];

/** Text of every page of a PDF, through a current pdf.js build. */
async function pdfText(bytes: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + " ";
  }
  return out;
}

const base = (route: string) => ({ route, role: "admin" as const, viewport: "desktop" as const, lang: "en" as const });

test("every report export matches the screen", async ({ page, context }) => {
  test.setTimeout(240_000);
  await setLang(context, "en");
  await login(page, "admin");
  await page.goto("/reports?period=month");

  for (const r of REPORTS) {
    const card = page.locator("h2", { hasText: new RegExp(`^${r.title}$`) }).first().locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]");
    const screenRows = await card.locator("table").first().locator("tbody tr").evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td")).filter((td) => !td.querySelector("button[aria-expanded]")).map((td) => (td.textContent ?? "").trim())));

    await check(base("/reports"), `xlsx export ${r.id} equals the screen table`, async () => {
      const res = await page.request.get(`/reports/export?format=xlsx&report=${r.id}&period=month`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("spreadsheet");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await res.body()) as unknown as Parameters<typeof wb.xlsx.load>[0]);
      const sheet = wb.worksheets[0];
      const header = sheet.getRow(4).values as unknown[];
      const kinds = (header.slice(1) as string[]).map((label, i) => ({ label, i }));
      const body: string[][] = [];
      for (let rowIndex = 5; rowIndex <= sheet.rowCount; rowIndex += 1) {
        const row = sheet.getRow(rowIndex);
        if (!row.hasValues) break;
        const first = row.getCell(1).value;
        const cells = kinds.map((k) => {
          const v = row.getCell(k.i + 1).value;
          if (v && typeof v === "object" && "formula" in v) return "__total__";
          const fmt = row.getCell(k.i + 1).numFmt ?? "";
          const kind = typeof v === "number" ? (fmt.includes("%") ? "pct" : fmt.includes("฿") ? "money" : "int") : "text";
          return formatCell(v as string | number | null, kind);
        });
        if (cells.includes("__total__")) break;
        body.push([String(first ?? ""), ...cells.slice(1)]);
      }
      const screenBody = screenRows.filter((cells) => cells[0] !== "Total");
      expect(body.length, `${r.id} row count: xlsx ${body.length} (${JSON.stringify(body[0] ?? [])}) vs screen ${screenBody.length} (${JSON.stringify(screenBody[0] ?? [])})`).toBe(screenBody.length);
      for (let i = 0; i < body.length; i += 1) {
        for (let c = 0; c < body[i].length; c += 1) {
          if (screenBody[i][c] === undefined) continue;
          const a = body[i][c].replace(/\s+/g, " ");
          const bb = screenBody[i][c].replace(/\s+/g, " ");
          expect(a, `${r.id} row ${i + 1} col ${c + 1}: xlsx "${a}" vs screen "${bb}"`).toBe(bb);
        }
      }
    }, { soft: true });

    await check(base("/reports"), `pdf export ${r.id} parses and carries the title`, async () => {
      const res = await page.request.get(`/reports/export?format=pdf&report=${r.id}&period=month`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("pdf");
      const bytes = Buffer.from(await res.body());
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThan(0);
      const flat = (await pdfText(bytes)).replace(/\s+/g, "");
      expect(flat).toContain(r.title.replace(/\s+/g, ""));
      if (screenRows.length) {
        const headline = screenRows[screenRows.length - 1].find((c) => c.startsWith("฿")) ?? screenRows[0].find((c) => c.startsWith("฿"));
        const digits = (headline ?? "").replace(/[^\d.]/g, "");
        if (digits) expect(flat.replace(/[^\d.]/g, ""), `pdf contains ${headline}`).toContain(digits);
      }
    }, { soft: true });
  }

  await check(base("/reports/units"), "units xlsx and pdf export", async () => {
    const x = await page.request.get("/reports/export?format=xlsx&report=units&granularity=day");
    expect(x.status()).toBe(200);
    const p = await page.request.get("/reports/export?format=pdf&report=units&granularity=day");
    expect(p.status()).toBe(200);
    expect(await pdfText(Buffer.from(await p.body()))).toContain("Units");
  });
  await check(base("/reports"), "download everything (all) in both formats", async () => {
    for (const format of ["xlsx", "pdf"]) {
      const res = await page.request.get(`/reports/export?format=${format}&report=all&period=month`);
      expect(res.status()).toBe(200);
    }
  });
});
