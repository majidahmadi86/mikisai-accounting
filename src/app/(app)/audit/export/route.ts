import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { auditChanges, parseAuditFilters, queryAudit } from "@/lib/audit-query";
import { requireAdmin } from "@/lib/auth";
import type { ExportTable } from "@/lib/exports/tables";
import { buildWorkbook } from "@/lib/exports/xlsx";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDateTime, todayIso } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /audit/export?user=&action=&entity=&from=&to= → one XLSX row per changed field. */
export async function GET(request: Request) {
  const [session, locale] = await Promise.all([requireAdmin("report", "audit"), getLocale()]);
  const tr = t(locale);
  const url = new URL(request.url);
  const filters = parseAuditFilters(Object.fromEntries(url.searchParams.entries()));
  const { rows, names } = await queryAudit(session.supabase, filters, 5000);

  const table: ExportTable = {
    id: "pl",
    title: tr("audit.title"),
    description: tr("audit.subtitle"),
    columns: [
      { key: "when", label: tr("audit.when"), kind: "text" },
      { key: "who", label: tr("audit.who"), kind: "text" },
      { key: "action", label: tr("audit.action"), kind: "text" },
      { key: "entity", label: tr("audit.entity"), kind: "text" },
      { key: "id", label: "ID", kind: "text" },
      { key: "field", label: tr("audit.what"), kind: "text" },
      { key: "before", label: tr("audit.before"), kind: "text" },
      { key: "after", label: tr("audit.after"), kind: "text" },
    ],
    rows: rows.flatMap((row) => {
      const base = [formatDateTime(row.created_at, locale), row.actor_user_id ? (names.get(row.actor_user_id) ?? row.actor_user_id) : "", tr(`audit.action.${row.action}`), tr(`audit.entity.${row.entity_type}` as "audit.entity.transaction"), row.entity_id ?? ""];
      const changes = auditChanges(row);
      if (!changes.length) return [[...base, "", "", ""]];
      return changes.map((c) => [...base, c.field, c.before, c.after]);
    }),
    totals: [],
    totalLabel: tr("common.total"),
  };

  const buffer = await buildWorkbook([table], {
    title: tr("audit.title"),
    periodLabel: [filters.from, filters.to].filter(Boolean).join(" → "),
    generatedBy: session.profile.display_name,
    generatedAt: formatDateTime(new Date().toISOString(), locale),
    brand: "MIKISAI",
  });

  await recordAudit(session, { action: "export", entity_type: "report", entity_id: "audit", after: { format: "xlsx", filters, rows: rows.length } });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mikisai-audit-${todayIso()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
