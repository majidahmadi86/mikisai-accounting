import { describe, expect, it } from "vitest";
import { REPORT_TODAY, seedLedger } from "@/lib/fixtures/report-data";
import { formatCell } from "@/lib/exports/format";
import { reportTables, transferTable } from "@/lib/exports/tables";
import { buildWorkbook, readSheetValues } from "@/lib/exports/xlsx";
import { pdfRows, renderReportPdf } from "@/lib/exports/pdf";
import { t } from "@/lib/i18n/server-free";
import { buildReports } from "@/lib/reports/build";

const period = { key: "custom" as const, from: "2026-09-01", to: "2026-09-30" };
const tr = t("en");
const bundle = buildReports(seedLedger(), period, `${REPORT_TODAY}T00:00:00Z`);
const tables = reportTables(bundle, tr, "en");
const meta = { title: "Reports", periodLabel: "September 2026", generatedBy: "Mike", generatedAt: "16 Sep 2026", brand: "MIKISAI" };

describe("report tables feed the screen and both exports", () => {
  it("profit and loss rows carry the on-screen numbers", () => {
    const pl = tables.find((x) => x.id === "pl")!;
    expect(pl.rows.map((r) => r[1])).toEqual([2960, -176, 2784, 0, 2784, -240, -600, -840, 1944, 0]);
    expect(formatCell(1944, "money")).toBe("฿1,944.00");
    expect(formatCell(-176, "money")).toBe("-฿176.00");
  });

  it("xlsx cells equal the table model and totals are SUM formulas", async () => {
    const buffer = await buildWorkbook(tables, meta);
    expect(buffer.length).toBeGreaterThan(5000);

    for (let i = 0; i < tables.length; i += 1) {
      const table = tables[i];
      const sheet = await readSheetValues(buffer, i);
      expect(sheet.header).toEqual(table.columns.map((c) => c.label));
      const body = sheet.rows.slice(0, table.rows.length);
      expect(body).toEqual(table.rows);
      if (table.totals.length) {
        const total = sheet.rows[table.rows.length];
        expect(total[0]).toBe(table.totalLabel);
        for (const c of table.totals) {
          expect(total[c]).toMatch(/^=SUM\([A-Z]+5:[A-Z]+\d+\)$/);
        }
      }
    }
  });

  it("the by-product sheet totals match the P&L", async () => {
    const product = tables.find((x) => x.id === "product")!;
    const netCol = product.columns.findIndex((c) => c.key === "net");
    const sum = product.rows.reduce((a, r) => a + (r[netCol] as number), 0);
    expect(sum).toBe(bundle.pl.net);
  });

  it("pdf rows print the same values as the table model, plus a computed total row", () => {
    const platform = tables.find((x) => x.id === "platform")!;
    const rows = pdfRows(platform);
    expect(rows[0]).toEqual(["Facebook", "1", "฿1,200.00", "฿1,200.00", "฿0.00", "0.00%"]);
    expect(rows[rows.length - 1]).toEqual(["Total", "4", "฿2,960.00", "฿2,784.00", "฿176.00", ""]);
  });

  it("renders a branded PDF with the bundled fonts (English and Thai)", async () => {
    const pdf = await renderReportPdf([...tables, transferTable(bundle, tr, "en")], {
      brand: "MIKISAI",
      title: "Reports",
      periodLabel: "September 2026",
      generatedBy: "Mike",
      generatedAt: "16 Sep 2026",
      pageLabel: (n, total) => `Page ${n} of ${total}`,
      locale: "en",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);

    const th = t("th");
    const thTables = reportTables(buildReports(seedLedger(), period), th, "th");
    const thPdf = await renderReportPdf(thTables, { brand: "MIKISAI", title: th("reports.title"), periodLabel: "กันยายน 2569", generatedBy: "Sai", generatedAt: "16 ก.ย. 2569", pageLabel: (n, total) => th("reports.page", { n, total }), locale: "th" });
    expect(thPdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});
