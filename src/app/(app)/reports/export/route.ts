import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { isReportId, reportTables, transferTable, type ExportTable } from "@/lib/exports/tables";
import { buildWorkbook } from "@/lib/exports/xlsx";
import { renderReportPdf } from "@/lib/exports/pdf";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/money";
import { buildReports } from "@/lib/reports/build";
import { periodLabel } from "@/lib/reports/label";
import { resolvePeriod } from "@/lib/reports/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /reports/export?format=xlsx|pdf&report=all|pl|product|platform|category|settlement|owes|customers&period=week|month|custom&from=&to=
 * The file is built from the same tables the page renders, so numbers match exactly.
 */
export async function GET(request: Request) {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const reportParam = url.searchParams.get("report") ?? "all";
  const report = isReportId(reportParam) ? reportParam : "all";
  const period = resolvePeriod({ period: url.searchParams.get("period"), from: url.searchParams.get("from"), to: url.searchParams.get("to") });

  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const bundle = buildReports(snapshot, period);
  const all = reportTables(bundle, tr, locale);
  let tables: ExportTable[] = report === "all" ? all : all.filter((x) => x.id === report);
  if (report === "all" || report === "owes") {
    const idx = tables.findIndex((x) => x.id === "owes");
    if (idx >= 0) tables = [...tables.slice(0, idx + 1), transferTable(bundle, tr, locale), ...tables.slice(idx + 1)];
  }

  const title = report === "all" ? tr("reports.title") : (tables[0]?.title ?? tr("reports.title"));
  const label = periodLabel(period, locale, tr);
  const generatedAt = formatDateTime(new Date().toISOString(), locale);
  const filename = `mikisai-${report}-${period.from}-${period.to}.${format}`;

  let body: Buffer;
  let contentType: string;
  if (format === "pdf") {
    body = await renderReportPdf(tables, {
      brand: "MIKISAI",
      title,
      periodLabel: label,
      generatedBy: session.profile.display_name,
      generatedAt,
      pageLabel: (n, total) => tr("reports.page", { n, total }),
      locale,
    });
    contentType = "application/pdf";
  } else {
    body = await buildWorkbook(tables, { title, periodLabel: label, generatedBy: session.profile.display_name, generatedAt, brand: "MIKISAI" });
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  await recordAudit(session, { action: "export", entity_type: "report", entity_id: report, after: { format, period, rows: tables.reduce((a, x) => a + x.rows.length, 0) } });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
