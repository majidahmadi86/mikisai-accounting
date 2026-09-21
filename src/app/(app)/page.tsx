import Link from "next/link";
import { BalanceBanner } from "@/components/dashboard/BalanceBanner";
import { AddButton } from "@/components/nav/AddButton";
import { StockPill } from "@/components/products/StockPill";
import { Tour } from "@/components/tour/Tour";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot, type LedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { NIGHTLY_STALE_HOURS } from "@/lib/import/nightly";
import { productLine } from "@/lib/search";
import { formatDateTime, todayIso } from "@/lib/money";
import { stockPositions, whoOwesWhom } from "@/lib/truth";

type Tr = ReturnType<typeof t>;

/**
 * Home holds three things only: who owes whom with the two partner cards, one
 * routine card (the admin's nightly files, or the contributor's "record what
 * you paid for"), and the Stock strip. Everything else lives on its own page.
 */
export default async function DashboardPage() {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const admin = session.profile.role === "admin";
  const balance = whoOwesWhom(snapshot, todayIso());
  const stockRows = stockPositions(snapshot).filter((r) => r.product.active);

  return (
    <div>
      <Tour autoOpen />
      <BalanceBanner balance={balance} tr={tr} />
      {admin ? <NightlyRoutine last={snapshot.lastTiktokImport} lastImport={snapshot.lastImport} tr={tr} locale={locale} /> : <PaidForRoutine lastImport={snapshot.lastImport} tr={tr} locale={locale} />}
      {stockRows.length ? (
        <Link href="/stock" className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-card px-4 py-3 transition-colors hover:bg-lavender-tint">
          <span className="eyebrow mr-1">{tr("stock.title")} →</span>
          {stockRows.map((r) => (
            <span key={r.product.id} className="inline-flex items-center gap-1.5 text-xs text-plum">
              <span className="max-w-44 truncate">{productLine(r.product, locale)}</span>
              <StockPill row={r} tr={tr} />
            </span>
          ))}
        </Link>
      ) : null}
    </div>
  );
}

/** The last time files or screenshots fed the ledger. A sale typed by hand is not an import. */
function LastImportLine({ lastImport, tr, locale }: { lastImport: LedgerSnapshot["lastImport"]; tr: Tr; locale: "en" | "th" }) {
  return (
    <p className="mt-3 border-t border-line pt-3 text-xs text-plum-faint">
      <Link href="/import" className="hover:underline">
        {lastImport ? tr("dashboard.lastImport", { source: tr(`dashboard.source.${lastImport.source}`), time: formatDateTime(lastImport.ran_at, locale), orders: lastImport.orders, cancellations: lastImport.cancellations, payouts: lastImport.payouts }) : tr("dashboard.lastImportNone")} →
      </Link>
    </p>
  );
}

/** The admin's one job: export yesterday from Seller Center, drop both files, confirm. Warns after 36 hours. */
function NightlyRoutine({ last, lastImport, tr, locale }: { last: LedgerSnapshot["lastTiktokImport"]; lastImport: LedgerSnapshot["lastImport"]; tr: Tr; locale: "en" | "th" }) {
  // eslint-disable-next-line react-hooks/purity -- a server component rendered per request
  const stale = !last || Date.now() - Date.parse(last.ran_at) > NIGHTLY_STALE_HOURS * 3600 * 1000;
  return (
    <Card tone={stale ? "warning" : "card"} className="mb-6 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{tr("home.tonight")}</p>
          <p className="mt-1 font-display text-xl text-plum">{tr("nightly.routineTitle")}</p>
          <p className="mt-1 text-sm text-plum-soft">{last ? tr("nightly.routineLast", { time: formatDateTime(last.ran_at, locale), orders: last.orders, cancellations: last.cancellations, payouts: last.payouts }) : tr("nightly.routineNever")}</p>
        </div>
        <ButtonLink href="/import">{tr("nightly.routineGo")}</ButtonLink>
      </div>
      <LastImportLine lastImport={lastImport} tr={tr} locale={locale} />
    </Card>
  );
}

/** The contributor's one job: when she buys stock, record what she paid. One button, straight to Stock purchase. */
function PaidForRoutine({ lastImport, tr, locale }: { lastImport: LedgerSnapshot["lastImport"]; tr: Tr; locale: "en" | "th" }) {
  return (
    <Card className="mb-6 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{tr("home.today")}</p>
          <p className="mt-1 font-display text-xl text-plum">{tr("home.paidForTitle")}</p>
        </div>
        <AddButton label={tr("home.paidForGo")} kind="expense" stockFirst />
      </div>
      <LastImportLine lastImport={lastImport} tr={tr} locale={locale} />
    </Card>
  );
}
