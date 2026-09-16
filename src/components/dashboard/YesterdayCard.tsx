import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { Pill } from "@/components/ui/Pill";
import type { Yesterday } from "@/lib/dashboard/yesterday";
import type { Locale, Translator } from "@/lib/i18n/dictionary";
import { shortProductName } from "@/lib/inventory/units";
import { formatDate, thb } from "@/lib/money";

export function YesterdayCard({ data, tr, locale }: { data: Yesterday; tr: Translator; locale: Locale }) {
  return (
    <Card className="mb-6">
      <CardHeader
        title={tr("dashboard.yesterday")}
        subtitle={tr("dashboard.yesterdayDesc", { date: formatDate(data.date, locale) })}
        action={
          <Link href="/reports/units" className="inline-flex min-h-11 items-center whitespace-nowrap text-sm text-berry hover:underline">
            {tr("dashboard.unitsReport")} →
          </Link>
        }
      />
      <div className="grid gap-4 px-5 pb-5 sm:px-6 sm:pb-6 lg:grid-cols-2">
        <div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-ivory-deep/70 px-3 py-2.5">
              <p className="eyebrow">{tr("dashboard.yesterdayOrders")}</p>
              <p className="mt-1 text-xl font-medium tabular text-plum">{data.orders}</p>
            </div>
            <div className="rounded-xl bg-ivory-deep/70 px-3 py-2.5">
              <p className="eyebrow">{tr("dashboard.yesterdayUnits")}</p>
              <p className="mt-1 text-xl font-medium tabular text-plum">{data.units}</p>
            </div>
            <div className="rounded-xl bg-ivory-deep/70 px-3 py-2.5">
              <p className="eyebrow">{tr("dashboard.yesterdayRevenue")}</p>
              <p className="mt-1 text-xl font-medium tabular text-plum">{thb(data.revenue)}</p>
            </div>
          </div>
          {data.perProduct.length === 0 ? (
            <p className="mt-3 text-sm text-plum-soft">{tr("dashboard.yesterdayNone")}</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {data.perProduct.map((r) => (
                <li key={r.product.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-plum">{shortProductName(r.product, locale)}</span>
                  <span className="shrink-0 tabular font-medium text-plum">× {r.units}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`rounded-xl px-4 py-3 ${data.toBuy.length ? "bg-berry-tint" : "bg-success-tint"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">{tr("dashboard.toBuy")}</p>
            <InfoTip text={tr("dashboard.toBuyHint")} />
          </div>
          {data.toBuy.length === 0 ? (
            <p className="mt-2 text-sm text-success">{tr("dashboard.toBuyNone")}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.toBuy.map((r) => (
                <li key={r.product.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-plum">{shortProductName(r.product, locale)}</span>
                  <Pill tone="berry">{tr("units.backlogUnits", { n: r.units })}</Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
