"use client";

import { controlClass } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Table, Td, Th } from "@/components/ui/Table";
import { useT } from "@/lib/i18n/client";
import { platformName, productName, statusName } from "@/lib/labels";
import { round2, thb } from "@/lib/money";
import { estimateNet } from "@/lib/parse/estimate";
import type { ReviewRow } from "@/lib/parse/schema";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, type PlatformSetting } from "@/lib/types";
import { cn } from "@/lib/cn";

const cell = cn(controlClass, "min-h-10 px-2 py-1 text-xs rounded-lg min-w-24");
const mobileCell = cn(controlClass, "text-sm");

export function ReviewTable({
  rows,
  onChange,
  settings,
}: {
  rows: ReviewRow[];
  onChange: (rows: ReviewRow[]) => void;
  settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[];
}) {
  const t = useT();

  function patch(key: string, changes: Partial<ReviewRow>) {
    onChange(
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...changes };
        // Re-estimate net when gross or platform changes and net was never on the report.
        if (next.net_estimated && ("gross_amount" in changes || "platform" in changes) && next.gross_amount != null) {
          next.net_amount = estimateNet(next.gross_amount, next.platform, settings);
        }
        return next;
      }),
    );
  }

  const included = rows.filter((r) => r.include);
  const totalNet = round2(included.reduce((s, r) => s + (r.net_amount ?? 0), 0));
  const totalGross = round2(included.reduce((s, r) => s + (r.gross_amount ?? 0), 0));
  const allIncluded = rows.length > 0 && included.length === rows.length;

  const options = {
    platforms: PLATFORMS.map((p) => ({ value: p, label: platformName(t, p) })),
    products: PRODUCT_LINES.map((p) => ({ value: p, label: productName(t, p) })),
    statuses: SETTLEMENT_STATUSES.map((s) => ({ value: s, label: statusName(t, s) })),
    people: PEOPLE.map((p) => ({ value: p, label: t(`common.${p}`) })),
  };

  return (
    <>
      {/* Phones: one editable card per order. */}
      <div className="md:hidden">
        <div className="mb-2 flex items-center justify-between rounded-card border border-line bg-card px-4 py-3 text-sm">
          <label className="flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={allIncluded} onChange={(e) => onChange(rows.map((r) => ({ ...r, include: e.target.checked })))} className="h-5 w-5 accent-[#8f315f]" />
            {t("import.rowsSelected", { n: included.length, total: rows.length })}
          </label>
          <span className="font-medium tabular">{thb(totalNet)}</span>
        </div>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className={cn("rounded-card border border-line bg-card px-4 py-3", !r.include && "opacity-60")}>
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-plum">
                  <input type="checkbox" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} className="h-5 w-5 accent-[#8f315f]" aria-label={t("import.include")} />
                  {r.order_id ? `#${r.order_id}` : r.customer_name ?? t("import.orderId")}
                </label>
                {r.net_estimated ? <Pill tone="warning">{t("common.estimated")}</Pill> : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="eyebrow mb-1 block">{t("common.gross")}</span>
                  <input type="number" inputMode="decimal" step="0.01" min="0" className={cn(mobileCell, "tabular")} value={r.gross_amount ?? ""} onChange={(e) => patch(r.key, { gross_amount: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{t("common.net")}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className={cn(mobileCell, "tabular", r.net_estimated && "border-warning bg-warning-tint/40")}
                    value={r.net_amount ?? ""}
                    onChange={(e) => patch(r.key, { net_amount: e.target.value === "" ? null : Number(e.target.value), net_estimated: false })}
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{t("common.date")}</span>
                  <input type="date" className={mobileCell} value={r.date ?? ""} onChange={(e) => patch(r.key, { date: e.target.value || null })} />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{t("common.customer")}</span>
                  <input className={mobileCell} value={r.customer_name ?? ""} onChange={(e) => patch(r.key, { customer_name: e.target.value || null })} />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{t("common.platform")}</span>
                  <select className={mobileCell} value={r.platform} onChange={(e) => patch(r.key, { platform: e.target.value as ReviewRow["platform"] })}>
                    {options.platforms.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{t("common.product")}</span>
                  <select className={mobileCell} value={r.product_line} onChange={(e) => patch(r.key, { product_line: e.target.value as ReviewRow["product_line"] })}>
                    {options.products.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{t("common.status")}</span>
                  <select className={mobileCell} value={r.status} onChange={(e) => patch(r.key, { status: e.target.value as ReviewRow["status"] })}>
                    {options.statuses.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{t("transactions.receivedBy")}</span>
                  <select className={mobileCell} value={r.received_by} onChange={(e) => patch(r.key, { received_by: e.target.value as ReviewRow["received_by"] })}>
                    {options.people.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 block">
                  <span className="eyebrow mb-1 block">{t("common.note")}</span>
                  <input className={mobileCell} value={r.note ?? ""} onChange={(e) => patch(r.key, { note: e.target.value || null })} />
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Table>
        <thead>
          <tr>
            <Th className="w-10">
              <input type="checkbox" checked={allIncluded} onChange={(e) => onChange(rows.map((r) => ({ ...r, include: e.target.checked })))} aria-label={t("import.include")} className="h-4 w-4 accent-[#8f315f]" />
            </Th>
            <Th>{t("import.orderId")}</Th>
            <Th>{t("common.date")}</Th>
            <Th>{t("common.customer")}</Th>
            <Th>{t("common.platform")}</Th>
            <Th>{t("common.product")}</Th>
            <Th align="right">{t("common.gross")}</Th>
            <Th align="right">{t("common.net")}</Th>
            <Th>{t("common.status")}</Th>
            <Th>{t("transactions.receivedBy")}</Th>
            <Th>{t("common.note")}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cn(!r.include && "opacity-50")}>
              <Td>
                <input type="checkbox" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} className="h-4 w-4 accent-[#8f315f]" aria-label={t("import.include")} />
              </Td>
              <Td>
                <input className={cn(cell, "min-w-28")} value={r.order_id ?? ""} onChange={(e) => patch(r.key, { order_id: e.target.value || null })} />
              </Td>
              <Td>
                <input type="date" className={cn(cell, "min-w-36")} value={r.date ?? ""} onChange={(e) => patch(r.key, { date: e.target.value || null })} />
              </Td>
              <Td>
                <input className={cn(cell, "min-w-32")} value={r.customer_name ?? ""} onChange={(e) => patch(r.key, { customer_name: e.target.value || null })} />
              </Td>
              <Td>
                <select className={cell} value={r.platform} onChange={(e) => patch(r.key, { platform: e.target.value as ReviewRow["platform"] })}>
                  {options.platforms.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Td>
              <Td>
                <select className={cell} value={r.product_line} onChange={(e) => patch(r.key, { product_line: e.target.value as ReviewRow["product_line"] })}>
                  {options.products.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Td>
              <Td align="right">
                <input type="number" step="0.01" min="0" className={cn(cell, "text-right")} value={r.gross_amount ?? ""} onChange={(e) => patch(r.key, { gross_amount: e.target.value === "" ? null : Number(e.target.value) })} />
              </Td>
              <Td align="right">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(cell, "text-right", r.net_estimated && "border-warning bg-warning-tint/40")}
                  value={r.net_amount ?? ""}
                  title={r.net_estimated ? t("import.estimatedNet") : undefined}
                  onChange={(e) => patch(r.key, { net_amount: e.target.value === "" ? null : Number(e.target.value), net_estimated: false })}
                />
                {r.net_estimated ? <p className="mt-0.5 text-[10px] text-warning-ink">{t("common.estimated")}</p> : null}
              </Td>
              <Td>
                <select className={cn(cell, "min-w-40")} value={r.status} onChange={(e) => patch(r.key, { status: e.target.value as ReviewRow["status"] })}>
                  {options.statuses.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Td>
              <Td>
                <select className={cell} value={r.received_by} onChange={(e) => patch(r.key, { received_by: e.target.value as ReviewRow["received_by"] })}>
                  {options.people.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Td>
              <Td>
                <input className={cn(cell, "min-w-40")} value={r.note ?? ""} onChange={(e) => patch(r.key, { note: e.target.value || null })} />
              </Td>
            </tr>
          ))}
          <tr>
            <Td className="font-medium" align="left">
              {included.length}
            </Td>
            <Td className="text-plum-soft">{t("common.total")}</Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
            <Td align="right" className="text-plum-faint">
              {thb(totalGross)}
            </Td>
            <Td align="right" className="font-medium">
              {thb(totalNet)}
            </Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
          </tr>
        </tbody>
      </Table>
    </>
  );
}
