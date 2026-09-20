"use client";

import { controlClass } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { useT } from "@/lib/i18n/client";
import { platformName, productName, statusName } from "@/lib/labels";
import { round2, thb } from "@/lib/money";
import { estimateNet } from "@/lib/parse/estimate";
import type { ReviewRow } from "@/lib/parse/schema";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, type PlatformSetting } from "@/lib/types";
import type { Product } from "@/lib/inventory/valuation";
import { pickerParts } from "@/lib/inventory/units";
import { cn } from "@/lib/cn";
import { unitSanity } from "@/lib/inventory/quantity";

const mobileCell = cn(controlClass, "text-sm");

export function ReviewTable({
  rows,
  onChange,
  settings,
  products,
}: {
  rows: ReviewRow[];
  onChange: (rows: ReviewRow[]) => void;
  settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[];
  products: Product[];
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

  const productById = new Map(products.map((p) => [p.id, p]));
  const sanityOf = (r: ReviewRow) => {
    const p = r.product_id ? productById.get(r.product_id) : null;
    return p && r.net_amount != null && r.quantity ? unitSanity(r.net_amount, r.quantity, p.default_price) : null;
  };
  const qtyInput = (r: ReviewRow, className: string) => (
    <input
      type="number"
      inputMode="numeric"
      min="1"
      step="1"
      required
      aria-invalid={!r.quantity}
      className={cn(className, "tabular", !r.quantity && "border-berry bg-berry-tint text-berry")}
      placeholder="?"
      value={r.quantity ?? ""}
      onChange={(e) => patch(r.key, { quantity: e.target.value === "" ? null : Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
    />
  );
  const tagPills = (r: ReviewRow) =>
    r.tags.length ? (
      <span className="flex flex-wrap gap-1">
        {r.tags.map((tag) => (
          <Pill key={tag} tone={tag === "already_recorded" ? "neutral" : tag === "cancelled" || tag === "refunded" ? "berry-soft" : "warning"}>
            {t(`import.tag.${tag}`)}
          </Pill>
        ))}
        {r.existing ? <span className="text-[11px] text-plum-faint">{r.tags.includes("status_change") ? t("import.willCancel", { date: r.existing.date }) : t("import.alreadyRecorded", { date: r.existing.date, amount: thb(r.existing.net_amount) })}</span> : null}
      </span>
    ) : null;
  const locked = (r: ReviewRow) => Boolean(r.existing) && !r.tags.includes("status_change");
  const included = rows.filter((r) => r.include);
  const totalNet = round2(included.reduce((s, r) => s + (r.net_amount ?? 0), 0));
  const allIncluded = rows.length > 0 && included.length === rows.length;

  const options = {
    platforms: PLATFORMS.map((p) => ({ value: p, label: platformName(t, p) })),
    products: PRODUCT_LINES.map((p) => ({ value: p, label: productName(t, p) })),
    statuses: SETTLEMENT_STATUSES.map((s) => ({ value: s, label: statusName(t, s) })),
    people: PEOPLE.map((p) => ({ value: p, label: t(`common.${p}`) })),
  };

  return (
    <>
      {/* One editable card per order at every width: thirteen editable columns cannot fit a screen without scrolling sideways. */}
      <div>
        <div className="mb-2 flex items-center justify-between rounded-card border border-line bg-card px-4 py-3 text-sm">
          <label className="flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={allIncluded} onChange={(e) => onChange(rows.map((r) => ({ ...r, include: e.target.checked })))} className="h-5 w-5 accent-[#8f315f]" />
            {t("import.rowsSelected", { n: included.length, total: rows.length })}
          </label>
          <span className="font-medium tabular">{thb(totalNet)}</span>
        </div>
        <ul className="grid gap-2 lg:grid-cols-2 wide:grid-cols-3">
          {rows.map((r) => (
            <li key={r.key} className={cn("rounded-card border border-line bg-card px-4 py-3", !r.include && "opacity-60")}>
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-plum">
                  <input type="checkbox" checked={r.include} disabled={locked(r)} onChange={(e) => patch(r.key, { include: e.target.checked })} className="h-5 w-5 accent-[#8f315f]" aria-label={t("import.include")} />
                  {r.order_id ? `#${r.order_id}` : r.customer_name ?? t("import.orderId")}
                </label>
              </div>
              <div className="mt-1">{tagPills(r)}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block col-span-2">
                  <span className="eyebrow mb-1 block">{t("import.product")}</span>
                  <select className={cn(mobileCell, !r.product_id && "border-warning bg-warning-tint/40")} value={r.product_id ?? ""} onChange={(e) => patch(r.key, { product_id: e.target.value || null, product_matched: true, product_line: products.find((p) => p.id === e.target.value)?.product_line ?? r.product_line })}>
                    <option value="">{t("import.unmatched")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {[pickerParts(p).variant, pickerParts(p).name].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                  {r.product_name ? <span className="mt-0.5 block text-[11px] text-plum-faint">{r.product_name}{r.variant ? ` · ${r.variant}` : ""}</span> : null}
                </label>
                <label className="block">
                  <span className={cn("eyebrow mb-1 block", !r.quantity && "text-berry")}>{t("import.qty")}</span>
                  {qtyInput(r, mobileCell)}
                  {!r.quantity ? <span className="mt-0.5 block text-[11px] text-berry">{t("import.qtyMissing")}</span> : null}
                  {sanityOf(r) ? <span className="mt-0.5 block text-[11px] text-warning-ink">{t("quick.qtyWarning", { n: sanityOf(r)!.looksLike, m: sanityOf(r)!.entered })}</span> : null}
                </label>
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
    </>
  );
}
