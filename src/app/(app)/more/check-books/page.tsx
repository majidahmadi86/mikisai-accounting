import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ReportTableView } from "@/components/reports/ReportTableView";
import { requireAdmin } from "@/lib/auth";
import { checkBooks } from "@/lib/accounting/statements";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { reportTables } from "@/lib/exports/tables";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDateTime, thb, todayIso } from "@/lib/money";
import { buildReports } from "@/lib/reports/build";
import { thisMonth } from "@/lib/reports/period";

export const dynamic = "force-dynamic";

/** Runs the accounting identities on live data. Admin only; contributors see the same result on Data health. */
export default async function CheckBooksPage() {
  const [session, locale] = await Promise.all([requireAdmin("report", "check-books"), getLocale()]);
  const tr = t(locale);
  const today = todayIso();
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const ranAt = new Date().toISOString();
  const result = checkBooks(snapshot, today);
  const bundle = buildReports(snapshot, thisMonth(today));
  const balance = reportTables(bundle, tr, locale).find((x) => x.id === "balance")!;
  const failing = result.checks.filter((c) => !c.ok).length;

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("books.title")} subtitle={tr("books.subtitle")} action={<ButtonLink href={`/more/check-books?ran=${encodeURIComponent(ranAt)}`} variant="secondary">{tr("books.run")}</ButtonLink>} />
      <Card tone={result.ok ? "success" : "berry"} className="px-5 py-5">
        <p className={`text-2xl font-medium ${result.ok ? "text-success" : "text-berry"}`}>{result.ok ? tr("books.ok") : tr("books.fail", { n: failing })}</p>
        <p className="mt-1 text-xs text-plum-soft">{tr("books.ranAt", { time: formatDateTime(ranAt, locale) })}</p>
        <ul className="mt-4 divide-y divide-line/60">
          {result.checks.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1 text-plum">{tr(`books.${c.key}` as "books.assets_equal_equity")}</span>
              <span className="flex items-center gap-2">
                <span className="tabular text-xs text-plum-soft">
                  {tr("books.expected")} {thb(c.expected)} · {tr("books.actual")} {thb(c.actual)}
                </span>
                <Pill tone={c.ok ? "success" : "berry"}>{c.ok ? "OK" : "!"}</Pill>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mt-4">
        <CardHeader title={balance.title} subtitle={balance.description} />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <ReportTableView table={balance} />
        </div>
      </Card>
    </div>
  );
}
