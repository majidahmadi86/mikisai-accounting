"use client";

import { Input } from "@/components/ui/Field";
import { ProductPicker } from "@/components/products/ProductPicker";
import { useT } from "@/lib/i18n/client";
import { unitSanity } from "@/lib/inventory/quantity";
import { unitsPerPurchase } from "@/lib/inventory/units";
import type { Product } from "@/lib/inventory/valuation";
import { round2, thb } from "@/lib/money";

export type ItemDraft = { product_id: string; qty: number; unit_price?: number; unit_cost?: number };
export type ItemChange = { index: number; field: "product" | "qty" | "price" | "add" | "remove" };

function intQty(raw: string, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(100000, n) : fallback;
}

export function lineTotal(row: ItemDraft, mode: "sale" | "purchase"): number {
  return round2(row.qty * ((mode === "purchase" ? row.unit_cost : row.unit_price) ?? 0));
}

/**
 * Controlled product lines. The parent owns the rows (so it can keep them in
 * step with the amount on the form) and renders the hidden "items" input.
 * Quantities are whole units; a sale line shows the sale price and average
 * cost, a purchase line only the cost per unit; each line shows its total.
 */
export function ItemsEditor({ products, rows, onChange, mode, avgCost = {} }: { products: Product[]; rows: ItemDraft[]; onChange: (rows: ItemDraft[], change: ItemChange) => void; mode: "sale" | "purchase"; avgCost?: Record<string, number> }) {
  const t = useT();
  const first = products[0];
  const fresh = (): ItemDraft => ({ product_id: first?.id ?? "", qty: 1, unit_price: first?.default_price ?? 0, unit_cost: first?.default_cost ?? 0 });

  function patch(i: number, changes: Partial<ItemDraft>, field: ItemChange["field"]) {
    onChange(
      rows.map((r, idx) => (idx === i ? { ...r, ...changes } : r)),
      { index: i, field },
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const product = products.find((x) => x.id === r.product_id);
        const warn = mode === "sale" && product ? unitSanity((r.unit_price ?? 0) * r.qty, r.qty, product.default_price) : null;
        // A product bought by the box and sold by the bag: a purchase line counts boxes, the ledger keeps bags.
        const per = mode === "purchase" && product ? unitsPerPurchase(product) : 1;
        return (
          <div key={i} className="rounded-xl border border-line bg-card p-3">
            <ProductPicker
              products={products}
              value={r.product_id}
              onChange={(id) => {
                const p = products.find((x) => x.id === id);
                patch(i, { product_id: id, unit_price: p?.default_price ?? r.unit_price, unit_cost: p?.default_cost ?? r.unit_cost }, "product");
              }}
              label={t("common.product")}
            />
            <div className="mt-2 grid grid-cols-[5rem_1fr_auto] items-end gap-2">
              <label className="block">
                <span className="eyebrow mb-1 block">{per > 1 ? t(`products.unit.${(product?.purchase_unit_label ?? "box") as "box"}`) : t("inventory.qty")}</span>
                <Input type="number" inputMode="numeric" min={1} step={1} value={per > 1 ? Math.max(1, Math.round(r.qty / per)) : r.qty} onChange={(e) => patch(i, { qty: per > 1 ? intQty(e.target.value, Math.round(r.qty / per)) * per : intQty(e.target.value, r.qty) }, "qty")} className="tabular" aria-label={t("inventory.qty")} />
              </label>
              <label className="block">
                <span className="eyebrow mb-1 block">{mode === "purchase" ? t("inventory.unitCost") : t("inventory.salePrice")}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={mode === "purchase" ? (r.unit_cost ?? 0) : (r.unit_price ?? 0)}
                  onChange={(e) => patch(i, mode === "purchase" ? { unit_cost: Number(e.target.value) || 0 } : { unit_price: Number(e.target.value) || 0 }, "price")}
                  className="tabular"
                />
              </label>
              <div className="pb-2.5 text-right">
                <span className="eyebrow block">{t("inventory.lineTotal")}</span>
                <span className="tabular text-sm font-medium text-plum">{thb(lineTotal(r, mode))}</span>
              </div>
            </div>
            {per > 1 && product ? (
              <p className="mt-1.5 text-xs text-plum-soft">{t("inventory.boxesToUnits", { packs: Math.max(1, Math.round(r.qty / per)), purchaseUnit: t(`products.unit.${(product.purchase_unit_label ?? "box") as "box"}`), units: r.qty, unit: t(`products.unit.${product.unit_label as "bag"}`) })}</p>
            ) : null}
            <p className="mt-1.5 text-xs text-plum-soft">{mode === "purchase" ? t("inventory.unitCostHintFactory") : t("inventory.salePriceHint")}</p>
            {mode === "sale" ? <p className="mt-1 text-xs text-plum-faint">{t("inventory.avgCostLine", { amount: thb(avgCost[r.product_id] ?? 0) })}</p> : null}
            {warn ? <p className="mt-1 rounded-lg bg-warning-tint px-2 py-1 text-xs text-warning-ink">{t("quick.qtyWarning", { n: warn.looksLike, m: warn.entered })}</p> : null}
          </div>
        );
      })}
      <div className="flex gap-3 text-xs">
        <button type="button" onClick={() => onChange([...rows, fresh()], { index: rows.length, field: "add" })} className="min-h-9 font-medium text-berry">
          + {t("inventory.addLine")}
        </button>
        {rows.length > 1 ? (
          <button type="button" onClick={() => onChange(rows.slice(0, -1), { index: rows.length - 1, field: "remove" })} className="min-h-9 text-plum-soft">
            {t("inventory.removeLine")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
