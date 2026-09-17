"use client";

import { useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { useLocale, useT } from "@/lib/i18n/client";
import { shortProductName, type Granularity, type UnitsRow } from "@/lib/inventory/units";
import { shortPeriodLabel } from "@/lib/inventory/units-labels";
import { thb } from "@/lib/money";
import { cn } from "@/lib/cn";

type Col = { key: keyof UnitsRow | "period" | "product"; label: string; numeric: boolean };

const num = (v: number | null) => (v === null ? "·" : String(v));

/**
 * Units per product per period. Period and product columns stay put while
 * the numbers scroll inside the card; subtotals and totals are a distinct
 * band, hidden until asked for; products with nothing in the range are
 * hidden until asked for.
 */
export function UnitsTable({ rows, totals, granularity }: { rows: UnitsRow[]; totals: UnitsRow[]; granularity: Granularity }) {
  const t = useT();
  const locale = useLocale();
  const [showSubtotals, setShowSubtotals] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const buckets = new Set(rows.filter((r) => r.kind === granularity).map((r) => r.from)).size;
  const active = new Set(totals.filter((r) => r.orders || r.unitsSold || r.unitsBought || r.samplesOut || r.onHandEnd || r.backlogEnd).map((r) => r.product.id));
  const hiddenCount = totals.length - active.size;
  const visible = rows.filter((r) => (showAll || active.has(r.product.id)) && (r.kind === granularity || (showSubtotals && buckets > 1)));
  const totalRows = showSubtotals && buckets > 1 ? totals.filter((r) => showAll || active.has(r.product.id)) : [];

  const cols: Col[] = [
    { key: "period", label: t("reports.period"), numeric: false },
    { key: "product", label: t("common.product"), numeric: false },
    { key: "orders", label: t("common.orders"), numeric: true },
    { key: "unitsSold", label: t("units.sold"), numeric: true },
    { key: "unitsBought", label: t("units.bought"), numeric: true },
    { key: "samplesOut", label: t("units.samples"), numeric: true },
    { key: "onHandEnd", label: t("units.onHandEnd"), numeric: true },
    { key: "backlogEnd", label: t("units.backlog"), numeric: true },
    { key: "avgSalePrice", label: t("units.avgPrice"), numeric: true },
    { key: "avgCostEnd", label: t("units.avgCost"), numeric: true },
  ];

  const cell = (r: UnitsRow, c: Col): string => {
    if (c.key === "period") return shortPeriodLabel(r.from, r.to, r.kind, locale, t("common.total"));
    if (c.key === "product") return shortProductName(r.product, locale);
    if (c.key === "avgSalePrice") return r.avgSalePrice === null ? "·" : thb(r.avgSalePrice);
    if (c.key === "avgCostEnd") return thb(r.avgCostEnd);
    return num(r[c.key] as number);
  };
  const band = (r: UnitsRow) => r.kind !== granularity;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {buckets > 1 ? (
          <button type="button" onClick={() => setShowSubtotals((v) => !v)} aria-pressed={showSubtotals} className={cn("inline-flex min-h-9 items-center rounded-full border px-3 font-medium", showSubtotals ? "border-plum bg-plum text-ivory" : "border-line bg-card text-plum-soft hover:border-plum-faint")}>
            {t("units.showSubtotals")}
          </button>
        ) : null}
        {hiddenCount > 0 ? (
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll} className={cn("inline-flex min-h-9 items-center rounded-full border px-3 font-medium", showAll ? "border-plum bg-plum text-ivory" : "border-line bg-card text-plum-soft hover:border-plum-faint")}>
            {t("units.showAll", { n: hiddenCount })}
          </button>
        ) : null}
      </div>
      <div className="max-w-full overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-max min-w-full text-sm">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={c.key}
                  className={cn("eyebrow whitespace-nowrap border-b border-line bg-ivory-deep px-3 py-2.5", c.numeric ? "text-right" : "text-left", i === 0 && "sticky left-0 z-10 w-36 min-w-36 max-w-36", i === 1 && "sticky left-36 z-10 min-w-32 shadow-[4px_0_6px_-4px_rgba(48,35,51,0.25)]")}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-3 py-4 text-sm text-plum-soft">
                  {t("units.empty")}
                </td>
              </tr>
            ) : null}
            {[...visible, ...totalRows].map((r, ri) => (
              <tr key={`${r.kind}-${r.from}-${r.product.id}-${ri}`} className={cn(band(r) ? "bg-lavender-tint font-medium" : ri % 2 === 1 ? "bg-ivory-deep/40" : "bg-card")}>
                {cols.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap border-b border-line/70 px-3 py-2 align-middle",
                      c.numeric ? "text-right tabular" : "text-left",
                      i === 0 && "sticky left-0 z-[1] w-36 min-w-36 max-w-36 overflow-hidden text-ellipsis",
                      i === 1 && "sticky left-36 z-[1] shadow-[4px_0_6px_-4px_rgba(48,35,51,0.25)]",
                      (i === 0 || i === 1) && (band(r) ? "bg-lavender-tint" : ri % 2 === 1 ? "bg-[#F7F2EB]" : "bg-card"),
                      c.key === "backlogEnd" && r.backlogEnd > 0 && "text-berry",
                    )}
                  >
                    {c.key === "backlogEnd" && r.backlogEnd > 0 ? <Pill tone="berry">{r.backlogEnd}</Pill> : cell(r, c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Compact per-product strip: units sold, bought, and stock or backlog at the end of the range. */
export function UnitsSummaryStrip({ totals }: { totals: UnitsRow[] }) {
  const t = useT();
  const locale = useLocale();
  const shown = totals.filter((r) => r.orders || r.unitsSold || r.unitsBought || r.samplesOut || r.onHandEnd || r.backlogEnd);
  if (!shown.length) return null;
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {shown.map((r) => (
        <div key={r.product.id} className="min-w-44 shrink-0 rounded-xl border border-line bg-card px-4 py-3">
          <p className="truncate text-sm font-medium text-plum">{shortProductName(r.product, locale)}</p>
          <dl className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="eyebrow text-[0.55rem]">{t("units.sold")}</dt>
              <dd className="tabular text-plum">{r.unitsSold}</dd>
            </div>
            <div>
              <dt className="eyebrow text-[0.55rem]">{t("units.bought")}</dt>
              <dd className="tabular text-plum">{r.unitsBought}</dd>
            </div>
            <div>
              <dt className="eyebrow text-[0.55rem]">{r.backlogEnd > 0 ? t("units.backlog") : t("units.onHandShort")}</dt>
              <dd className={cn("tabular", r.backlogEnd > 0 ? "font-medium text-berry" : "text-plum")}>{r.backlogEnd > 0 ? r.backlogEnd : r.onHandEnd}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
