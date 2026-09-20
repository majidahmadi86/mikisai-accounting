"use client";

import { useState } from "react";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { Pill } from "@/components/ui/Pill";
import { RowDetail, Table, Td, Th, type ColKind, type ColPriority } from "@/components/ui/Table";
import { productLine } from "@/lib/search";
import { useLocale, useT } from "@/lib/i18n/client";
import { shortProductName, type Granularity, type UnitsRow } from "@/lib/inventory/units";
import { shortPeriodLabel } from "@/lib/inventory/units-labels";
import { thb } from "@/lib/money";
import { cn } from "@/lib/cn";

type Col = { key: keyof UnitsRow | "period" | "product"; label: string; kind: ColKind; priority?: ColPriority };

const num = (v: number | null) => (v === null ? "·" : String(v));

/**
 * Units per product per period. It never scrolls sideways: samples and
 * returns appear from 1280px, the two averages from 1440px, and whatever is
 * hidden shows in the row detail; below 1024px every row is a card. Subtotals
 * and totals are a distinct band, hidden until asked for; products with
 * nothing in the range are hidden until asked for.
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
    { key: "period", label: t("reports.period"), kind: "short" },
    { key: "product", label: t("common.product"), kind: "long" },
    { key: "orders", label: t("common.orders"), kind: "num" },
    { key: "unitsSold", label: t("units.sold"), kind: "num" },
    { key: "unitsBought", label: t("units.bought"), kind: "num" },
    { key: "samplesOut", label: t("units.samples"), kind: "num", priority: "secondary" },
    { key: "unitsReturned", label: t("units.returns"), kind: "num", priority: "secondary" },
    { key: "onHandEnd", label: t("units.onHandEnd"), kind: "num" },
    { key: "backlogEnd", label: t("units.backlog"), kind: "num" },
    { key: "avgSalePrice", label: t("units.avgPrice"), kind: "money", priority: "tertiary" },
    { key: "avgCostEnd", label: t("units.avgCost"), kind: "money", priority: "tertiary" },
  ];

  const cell = (r: UnitsRow, c: Col): string => {
    if (c.key === "period") return shortPeriodLabel(r.from, r.to, r.kind, locale, t("common.total"));
    if (c.key === "product") return productLine(r.product, locale);
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
      {visible.length === 0 ? <p className="rounded-card border border-line bg-card px-4 py-4 text-sm text-plum-soft">{t("units.empty")}</p> : null}
      <ul className="space-y-2 lg:hidden">
        {[...visible, ...totalRows].map((r, ri) => (
          <li key={`${r.kind}-${r.from}-${r.product.id}-${ri}`} className={cn("rounded-xl border px-4 py-3", band(r) ? "border-lavender bg-lavender-tint" : "border-line bg-card")}>
            <p className="text-sm font-medium text-plum">{cell(r, cols[1])}</p>
            <p className="text-xs text-plum-faint">{cell(r, cols[0])}</p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 min-[480px]:grid-cols-3">
              {cols.slice(2).map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-2 text-xs">
                  <dt className="eyebrow shrink-0 text-[0.6rem]">{c.label}</dt>
                  <dd className={cn("tabular whitespace-nowrap text-plum", c.key === "backlogEnd" && r.backlogEnd > 0 && "font-medium text-berry")}>{cell(r, c)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {visible.length ? (
        <Table>
          <thead>
            <tr>
              {cols.map((c) => (
                <Th key={c.key} kind={c.kind} priority={c.priority}>
                  {c.label}
                </Th>
              ))}
              <Th kind="action">
                <span className="sr-only">{t("table.showDetail")}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {[...visible, ...totalRows].map((r, ri) => (
              <ExpandableRow
                key={`${r.kind}-${r.from}-${r.product.id}-${ri}`}
                className={cn(band(r) ? "bg-lavender-tint font-medium" : ri % 2 === 1 ? "bg-ivory-deep/40" : "")}
                label={`${cell(r, cols[0])} ${cell(r, cols[1])}`}
                detail={<RowDetail items={[{ label: t("table.fullName"), value: locale === "th" && r.product.name_th ? r.product.name_th : r.product.name, wide: true }, ...cols.filter((c) => c.priority).map((c) => ({ label: c.label, value: <span className="tabular">{cell(r, c)}</span>, priority: c.priority }))]} />}
              >
                {cols.map((c) => (
                  <Td key={c.key} kind={c.kind} priority={c.priority} title={c.key === "product" ? r.product.name : undefined} className={cn(c.key === "period" && "text-plum-soft")}>
                    {c.key === "backlogEnd" && r.backlogEnd > 0 ? <Pill tone="berry">{r.backlogEnd}</Pill> : cell(r, c)}
                  </Td>
                ))}
              </ExpandableRow>
            ))}
          </tbody>
        </Table>
      ) : null}
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
    <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
      {shown.map((r) => (
        <div key={r.product.id} className="min-w-0 rounded-xl border border-line bg-card px-4 py-3">
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
