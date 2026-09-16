import { describe, expect, it } from "vitest";
import { rowsWithTotal } from "@/components/reports/ReportTableView";
import { seedLedger, REPORT_TODAY } from "@/lib/fixtures/report-data";
import { reportTables } from "@/lib/exports/tables";
import { t } from "@/lib/i18n/server";
import { buildReports } from "@/lib/reports/build";

const period = { key: "custom" as const, from: "2026-09-01", to: "2026-09-30" };
const tables = reportTables(buildReports(seedLedger(), period, `${REPORT_TODAY}T00:00:00Z`), t("en"), "en");

describe("report table rows as rendered", () => {
  it("payments by category: every value sits in its own column and the total row sums count, amount and previous only", () => {
    const rows = rowsWithTotal(tables.find((x) => x.id === "category")!);
    expect(rows.map((r) => r.cells)).toMatchInlineSnapshot(`
      [
        [
          "Ads",
          "1",
          "฿600.00",
          "71.43%",
          "฿0.00",
          "",
        ],
        [
          "Packaging",
          "1",
          "฿240.00",
          "28.57%",
          "฿0.00",
          "",
        ],
        [
          "Total",
          "2",
          "฿840.00",
          "",
          "฿0.00",
          "",
        ],
      ]
    `);
    expect(rows[rows.length - 1].total).toBe(true);
  });

  it("who owes whom always has the period-end row", () => {
    const rows = rowsWithTotal(tables.find((x) => x.id === "owes")!);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells[0]).toBe("30 Sept 2026");
    expect(rows[0].cells[4]).toBe("Mike owes Sai ฿171.50");
  });
});
