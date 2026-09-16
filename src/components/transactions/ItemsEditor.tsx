"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import { productLabel } from "@/lib/inventory/reports";
import type { Product } from "@/lib/inventory/valuation";
import { thb } from "@/lib/money";

export type ItemDraft = { product_id: string; qty: number; unit_price?: number; unit_cost?: number };

function intQty(raw: string, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(100000, n) : fallback;
}

/**
 * Product lines on the full edit form, serialised as JSON in a hidden input
 * named "items". Quantities are whole units. A sale shows the sale price and
 * a read-only average cost; a purchase shows only the cost per unit.
 */
export function ItemsEditor({ products, initial, mode, avgCost = {} }: { products: Product[]; initial: ItemDraft[]; mode: "sale" | "purchase"; avgCost?: Record<string, number> }) {
  const t = useT();
  const first = products[0];
  const fresh = (): ItemDraft => ({ product_id: first?.id ?? "", qty: 1, unit_price: first?.default_price ?? 0, unit_cost: first?.default_cost ?? 0 });
  const [rows, setRows] = useState<ItemDraft[]>(initial.length ? initial.map((r) => ({ ...r, qty: Math.max(1, Math.round(r.qty)) })) : [fresh()]);

  function patch(i: number, changes: Partial<ItemDraft>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...changes } : r)));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-line bg-card p-3">
          <div className="grid grid-cols-[1fr_5rem] items-end gap-2 sm:grid-cols-[1fr_5rem_8rem]">
            <label className="block">
              <span className="eyebrow mb-1 block">{t("common.product")}</span>
              <Select
                value={r.product_id}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  patch(i, { product_id: e.target.value, unit_price: p?.default_price ?? r.unit_price, unit_cost: p?.default_cost ?? r.unit_cost });
                }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {productLabel(p)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">{t("inventory.qty")}</span>
              <Input type="number" inputMode="numeric" min={1} step={1} value={r.qty} onChange={(e) => patch(i, { qty: intQty(e.target.value, r.qty) })} className="tabular" />
            </label>
            <label className="block col-span-2 sm:col-span-1">
              <span className="eyebrow mb-1 block">{mode === "purchase" ? t("inventory.unitCost") : t("inventory.salePrice")}</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={mode === "purchase" ? (r.unit_cost ?? 0) : (r.unit_price ?? 0)}
                onChange={(e) => patch(i, mode === "purchase" ? { unit_cost: Number(e.target.value) || 0 } : { unit_price: Number(e.target.value) || 0 })}
                className="tabular"
              />
            </label>
          </div>
          <p className="mt-1.5 text-xs text-plum-soft">{mode === "purchase" ? t("inventory.unitCostHintFactory") : t("inventory.salePriceHint")}</p>
          {mode === "sale" ? <p className="mt-1 text-xs text-plum-faint">{t("inventory.avgCostLine", { amount: thb(avgCost[r.product_id] ?? 0) })}</p> : null}
        </div>
      ))}
      <div className="flex gap-3 text-xs">
        <button type="button" onClick={() => setRows((rs) => [...rs, fresh()])} className="min-h-9 font-medium text-berry">
          + {t("inventory.addLine")}
        </button>
        {rows.length > 1 ? (
          <button type="button" onClick={() => setRows((rs) => rs.slice(0, -1))} className="min-h-9 text-plum-soft">
            {t("inventory.removeLine")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
