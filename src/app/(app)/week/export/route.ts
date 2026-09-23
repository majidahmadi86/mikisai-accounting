import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { renderReportPdf } from "@/lib/exports/pdf";
import { buildWorkbook } from "@/lib/exports/xlsx";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDate, formatDateTime, todayIso } from "@/lib/money";
import { weekOf } from "@/lib/week";
import { weekFromSnapshot, weekTable } from "@/lib/week-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /week/export?format=xlsx|pdf&from=YYYY-MM-DD: the week as the page shows it, line for line. */
export async function GET(request: Request) {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const from = url.searchParams.get("from");
  const today = todayIso();
  const period = weekOf(from, today);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const table = weekTable(weekFromSnapshot(snapshot, period, today, locale), tr);
  const label = tr("week.range", { from: formatDate(period.from, locale), to: formatDate(period.to, locale) });
  const generatedAt = formatDateTime(new Date().toISOString(), locale);
  const filename = `mikisai-week-${period.from}.${format}`;
  const body =
    format === "pdf"
      ? await renderReportPdf([table], { brand: "MikiSai", title: tr("week.title"), periodLabel: label, generatedBy: session.profile.display_name, generatedAt, pageLabel: (n, total) => tr("reports.page", { n, total }), locale })
      : await buildWorkbook([table], { title: tr("week.title"), periodLabel: label, generatedBy: session.profile.display_name, generatedAt, brand: "MikiSai" });
  await recordAudit(session, { action: "export", entity_type: "report", entity_id: null, after: { report: "week", format, from: period.from, to: period.to } });
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
