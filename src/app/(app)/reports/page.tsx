import dynamic from "next/dynamic";
import { AddButton } from "@/components/nav/AddButton";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { ReportTableView } from "@/components/reports/ReportTableView";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DownloadIcon } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { inventoryTables, reportTables, transferTable, type ExportTable } from "@/lib/exports/tables";
import { getLocale, t } from "@/lib/i18n/server";
import { thb } from "@/lib/money";
import { buildReports } from "@/lib/reports/build";
import { periodLabel } from "@/lib/reports/label";
import { periodQuery, resolvePeriod } from "@/lib/reports/period";
import { categoryLabel } from "@/lib/categories";
import Link from "next/link";

const BarList = dynamic(() => import("@/components/charts/BarList").then((m) => m.BarList), {
  loading: () => <div className="h-20 animate-pulse rounded-xl bg-ivory-deep" aria-hidden="true" />,
});

function ExportLinks({ report, qs, xlsx, pdf, small = false }: { report: string; qs: string; xlsx: string; pdf: string; small?: boolean }) {
  const base = small
    ? "inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-card px-3 text-xs font-medium text-plum-soft hover:border-berry hover:text-berry"
    : "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-medium text-plum hover:border-berry hover:text-berry";
  return (
    <div className="flex gap-2">
      <a href={`/reports/export?format=xlsx&report=${report}&${qs}`} className={base}>
        <DownloadIcon className="h-4 w-4" /> {xlsx}
      </a>
      <a href={`/reports/export?format=pdf&report=${report}&${qs}`} className={base}>
        <DownloadIcon className="h-4 w-4" /> {pdf}
      </a>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const period = resolvePeriod(sp);
  const qs = periodQuery(period);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const bundle = buildReports({ ...snapshot, items: snapshot.items }, period);
  const tables = [...reportTables(bundle, tr, locale), ...inventoryTables(bundle, tr)];
  const transfers = transferTable(bundle, tr, locale);
  const byId = Object.fromEntries(tables.map((x) => [x.id, x])) as Record<ExportTable["id"], ExportTable>;
  const empty = bundle.pl.orders === 0 && bundle.pl.totalExpenses === 0 && !(bundle.inventory && bundle.inventory.stock.length);

  const chart = {
    product: bundle.byProduct.map((r) => ({ label: tr(`product.${r.product}`), value: r.net, display: thb(r.net) })),
    platform: bundle.byPlatform.map((r) => ({ label: tr(`platform.${r.platform}`), value: r.net, display: thb(r.net) })),
    category: bundle.byCategory.map((r) => ({ label: categoryLabel(r.category, locale), value: r.amount, display: thb(r.amount), tone: "lavender" as const })),
  };

  return (
    <div>
      <PageHeader title={tr("reports.title")} subtitle={tr("reports.subtitle")} action={empty ? null : <ExportLinks report="all" qs={qs} xlsx={`${tr("reports.exportAll")} · ${tr("reports.xlsx")}`} pdf={tr("reports.pdf")} />} />
      <div className="mb-5">
        <PeriodPicker period={period} />
        <p className="mt-2 px-1 text-xs text-plum-faint">{periodLabel(period, locale, tr)}</p>
      </div>

      {empty ? (
        <EmptyState title={tr("reports.empty")} body={tr("reports.emptyBody")} action={<AddButton label={tr("dashboard.addFirst")} />} />
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader title={byId.pl.title} subtitle={byId.pl.description} action={<ExportLinks small report="pl" qs={qs} xlsx={tr("reports.xlsx")} pdf={tr("reports.pdf")} />} />
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-ivory-deep/70 px-4 py-3">
                  <p className="eyebrow">{tr("reports.plNet")}</p>
                  <p className="mt-1 font-medium text-xl tabular text-plum">{thb(bundle.pl.net)}</p>
                  <p className="text-xs text-plum-faint">{tr("reports.plOrders", { n: bundle.pl.orders, units: bundle.pl.units })}</p>
                </div>
                <div className="rounded-xl bg-ivory-deep/70 px-4 py-3">
                  <p className="eyebrow">{tr("reports.plFees")}</p>
                  <p className="mt-1 font-medium text-xl tabular text-plum">{thb(bundle.pl.fees)}</p>
                </div>
                <div className="rounded-xl bg-ivory-deep/70 px-4 py-3">
                  <p className="eyebrow">{tr("reports.plExpenses")}</p>
                  <p className="mt-1 font-medium text-xl tabular text-plum">{thb(bundle.pl.totalExpenses)}</p>
                </div>
                <div className={`rounded-xl px-4 py-3 ${bundle.pl.profit >= 0 ? "bg-success-tint" : "bg-berry-tint"}`}>
                  <p className="eyebrow">{tr("reports.plProfit")}</p>
                  <p className={`mt-1 font-medium text-xl tabular ${bundle.pl.profit >= 0 ? "text-success" : "text-berry"}`}>{thb(bundle.pl.profit)}</p>
                </div>
              </div>
              <ReportTableView table={byId.pl} />
            </div>
          </Card>

          {(["product", "platform", "category"] as const).map((id) => (
            <Card key={id}>
              <CardHeader title={byId[id].title} subtitle={byId[id].description} action={<ExportLinks small report={id} qs={qs} xlsx={tr("reports.xlsx")} pdf={tr("reports.pdf")} />} />
              <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                {chart[id].length ? <BarList data={chart[id]} className="mb-4" /> : null}
                <ReportTableView table={byId[id]} />
                {id === "category" && bundle.byCategory.length ? (
                  <div className="mt-4">
                    <p className="eyebrow mb-2">{tr("reports.drillDown")}</p>
                    <div className="flex flex-wrap gap-2">
                      {bundle.byCategory
                        .filter((r) => r.count > 0)
                        .map((r) => (
                          <Link key={r.category.id} href={`/transactions?type=expense&category=${r.category.id}&from=${period.from}&to=${period.to}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-card px-3.5 text-xs font-medium text-plum hover:border-berry hover:text-berry">
                            {categoryLabel(r.category, locale)} <span className="tabular text-plum-faint">{r.count}</span> →
                          </Link>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}

          <Card>
            <CardHeader title={byId.settlement.title} subtitle={byId.settlement.description} action={<ExportLinks small report="settlement" qs={qs} xlsx={tr("reports.xlsx")} pdf={tr("reports.pdf")} />} />
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <ReportTableView table={byId.settlement} />
            </div>
          </Card>

          <Card>
            <CardHeader title={byId.owes.title} subtitle={byId.owes.description} action={<ExportLinks small report="owes" qs={qs} xlsx={tr("reports.xlsx")} pdf={tr("reports.pdf")} />} />
            <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              <ReportTableView table={byId.owes} />
              <div>
                <p className="eyebrow mb-2">{tr("reports.transfersInPeriod")}</p>
                {transfers.rows.length ? <ReportTableView table={transfers} /> : <p className="text-sm text-plum-soft">{tr("reports.noTransfers")}</p>}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={byId.customers.title} subtitle={byId.customers.description} action={<ExportLinks small report="customers" qs={qs} xlsx={tr("reports.xlsx")} pdf={tr("reports.pdf")} />} />
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <ReportTableView table={byId.customers} />
            </div>
          </Card>

          {bundle.inventory ? (
            <>
              <Card>
                <CardHeader title={byId.stock.title} subtitle={byId.stock.description} action={<ExportLinks small report="stock" qs={qs} xlsx={tr("reports.xlsx")} pdf={tr("reports.pdf")} />} />
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  <p className="mb-3 font-medium text-2xl tabular text-plum">{thb(bundle.inventory.valuation.totalValue)}</p>
                  <ReportTableView table={byId.stock} />
                </div>
              </Card>
              <Card tone={bundle.inventory.lowStock.length ? "warning" : "success"}>
                <CardHeader title={byId.lowstock.title} subtitle={byId.lowstock.description} />
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  {bundle.inventory.lowStock.length ? <ReportTableView table={byId.lowstock} /> : <p className="text-sm text-success">{tr("reports.lowStockNone")}</p>}
                </div>
              </Card>
              <Card>
                <CardHeader title={byId.profit.title} subtitle={byId.profit.description} action={<ExportLinks small report="profit" qs={qs} xlsx={tr("reports.xlsx")} pdf={tr("reports.pdf")} />} />
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  <ReportTableView table={byId.profit} />
                </div>
              </Card>
              <Card>
                <CardHeader title={byId.samples.title} subtitle={byId.samples.description} action={<ExportLinks small report="samples" qs={qs} xlsx={tr("reports.xlsx")} pdf={tr("reports.pdf")} />} />
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  {bundle.inventory.samples.length ? <ReportTableView table={byId.samples} /> : <p className="text-sm text-plum-soft">{tr("reports.samplesNone")}</p>}
                </div>
              </Card>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
