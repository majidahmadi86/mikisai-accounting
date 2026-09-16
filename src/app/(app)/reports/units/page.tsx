import Link from "next/link";
import { GranularityPicker } from "@/components/reports/GranularityPicker";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { ReportTableView } from "@/components/reports/ReportTableView";
import { Card, CardHeader } from "@/components/ui/Card";
import { DownloadIcon } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { unitsTable } from "@/lib/exports/tables";
import { getLocale, t } from "@/lib/i18n/server";
import { buildUnitsReport, last14Days, shortProductName, type Granularity } from "@/lib/inventory/units";
import { valueStock } from "@/lib/inventory/valuation";
import { todayIso } from "@/lib/money";
import { periodLabel } from "@/lib/reports/label";
import { periodQuery, resolvePeriod } from "@/lib/reports/period";

function granularityOf(v: unknown): Granularity {
  return v === "week" || v === "month" ? v : "day";
}

export default async function UnitsReportPage({ searchParams }: PageProps<"/reports/units">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const today = todayIso();
  const period = sp.period ? resolvePeriod(sp, today) : last14Days(today);
  const granularity = granularityOf(sp.granularity);
  const qs = periodQuery(period);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const report = buildUnitsReport({ products: snapshot.products, movements: snapshot.movements, items: snapshot.items, sales: snapshot.transactions.filter((x) => x.type === "income").map((x) => ({ id: x.id, date: x.date })) }, period, granularity);
  const table = unitsTable(report, tr, locale);
  const backlog = valueStock(snapshot.products, snapshot.movements).products.filter((r) => r.backlog > 0);
  const linkClass = "inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-card px-3 text-xs font-medium text-plum-soft hover:border-berry hover:text-berry";

  return (
    <div>
      <PageHeader
        eyebrow={tr("reports.title")}
        title={tr("units.title")}
        subtitle={tr("units.subtitle")}
        action={
          <div className="flex gap-2">
            <a href={`/reports/export?format=xlsx&report=units&granularity=${granularity}&${qs}`} className={linkClass}>
              <DownloadIcon className="h-4 w-4" /> {tr("reports.xlsx")}
            </a>
            <a href={`/reports/export?format=pdf&report=units&granularity=${granularity}&${qs}`} className={linkClass}>
              <DownloadIcon className="h-4 w-4" /> {tr("reports.pdf")}
            </a>
          </div>
        }
      />
      <div className="mb-5 space-y-3">
        <PeriodPicker period={period} basePath="/reports/units" />
        <GranularityPicker value={granularity} qs={qs} tr={tr} />
        <p className="px-1 text-xs text-plum-faint">
          {sp.period ? periodLabel(period, locale, tr) : `${tr("units.last14")} · ${periodLabel(period, locale, tr)}`} · <Link href="/reports" className="text-berry hover:underline">{tr("reports.title")} →</Link>
        </p>
      </div>

      <Card tone={backlog.length ? "berry" : "success"} className="mb-4 px-5 py-4">
        <p className="eyebrow">{tr("units.toBuyToday")}</p>
        {backlog.length === 0 ? (
          <p className="mt-1 text-sm text-plum-soft">{tr("units.toBuyNone")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {backlog.map((r) => (
              <li key={r.product.id}>
                <Pill tone="berry">
                  {shortProductName(r.product, locale)} · {tr("units.backlogUnits", { n: r.backlog })}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={table.title} subtitle={table.description} />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">{report.rows.length ? <ReportTableView table={table} /> : <p className="text-sm text-plum-soft">{tr("units.empty")}</p>}</div>
      </Card>
    </div>
  );
}
