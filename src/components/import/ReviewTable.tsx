"use client";

import { controlClass } from "@/components/ui/Field";
import { Table, Td, Th } from "@/components/ui/Table";
import { useT } from "@/lib/i18n/client";
import { platformName, productName, statusName } from "@/lib/labels";
import { round2, thb } from "@/lib/money";
import { estimateNet } from "@/lib/parse/estimate";
import type { ReviewRow } from "@/lib/parse/schema";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, type PlatformSetting } from "@/lib/types";
import { cn } from "@/lib/cn";

const cell = cn(controlClass, "px-2 py-1 text-xs rounded-lg min-w-24");

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
  const allIncluded = rows.length > 0 && included.length === rows.length;

  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-10">
            <input type="checkbox" checked={allIncluded} onChange={(e) => onChange(rows.map((r) => ({ ...r, include: e.target.checked })))} aria-label={t("import.include")} className="accent-[#8f315f]" />
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
              <input type="checkbox" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} className="accent-[#8f315f]" aria-label={t("import.include")} />
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
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {platformName(t, p)}
                  </option>
                ))}
              </select>
            </Td>
            <Td>
              <select className={cell} value={r.product_line} onChange={(e) => patch(r.key, { product_line: e.target.value as ReviewRow["product_line"] })}>
                {PRODUCT_LINES.map((p) => (
                  <option key={p} value={p}>
                    {productName(t, p)}
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
              {r.net_estimated ? <p className="mt-0.5 text-[10px] text-warning">{t("common.estimated")}</p> : null}
            </Td>
            <Td>
              <select className={cn(cell, "min-w-40")} value={r.status} onChange={(e) => patch(r.key, { status: e.target.value as ReviewRow["status"] })}>
                {SETTLEMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusName(t, s)}
                  </option>
                ))}
              </select>
            </Td>
            <Td>
              <select className={cell} value={r.received_by} onChange={(e) => patch(r.key, { received_by: e.target.value as ReviewRow["received_by"] })}>
                {PEOPLE.map((p) => (
                  <option key={p} value={p}>
                    {t(`common.${p}`)}
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
            {thb(round2(included.reduce((s, r) => s + (r.gross_amount ?? 0), 0)))}
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
  );
}
