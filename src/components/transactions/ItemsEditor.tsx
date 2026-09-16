"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import { productLabel } from "@/lib/inventory/reports";
import type { Product } from "@/lib/inventory/valuation";

export type ItemDraft = { product_id: string; qty: number; unit_price?: number; unit_cost?: number };

/**
 * Product lines on the full edit form. Serialised as JSON in a hidden input
 * named "items"; the server validates it with the transaction schema.
 */
export function ItemsEditor({ products, initial, mode }: { products: Product[]; initial: ItemDraft[]; mode: "sale" | "purchase" | "none" }) {
  const t = useT();
  const [rows, setRows] = useState<ItemDraft[]>(initial.length ? initial : [{ product_id: products[0]?.id ?? "", qty: 1, unit_price: products[0]?.default_price ?? 0, unit_cost: products[0]?.default_cost ?? 0 }]);

  function patch(i: number, changes: Partial<ItemDraft>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...changes } : r)));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_5rem_6rem] items-end gap-2">
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
            <Input type="number" inputMode="decimal" min="0.001" step="1" value={r.qty} onChange={(e) => patch(i, { qty: Math.max(0.001, Number(e.target.value) || 0) })} className="tabular" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{mode === "purchase" ? t("inventory.unitCost") : t("inventory.unitPrice")}</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={mode === "purchase" ? (r.unit_cost ?? 0) : (r.unit_price ?? 0)}
              onChange={(e) => patch(i, mode === "purchase" ? { unit_cost: Number(e.target.value) || 0 } : { unit_price: Number(e.target.value) || 0 })}
              className="tabular"
            />
          </label>
        </div>
      ))}
      <div className="flex gap-3 text-xs">
        <button type="button" onClick={() => setRows((rs) => [...rs, { product_id: products[0]?.id ?? "", qty: 1, unit_price: products[0]?.default_price ?? 0, unit_cost: products[0]?.default_cost ?? 0 }])} className="min-h-9 font-medium text-berry">
          + {t("inventory.addLine")}
        </button>
        {rows.length > 1 ? (
          <button type="button" onClick={() => setRows((rs) => rs.slice(0, -1))} className="min-h-9 text-plum-soft">
            {t("inventory.removeLine")}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-plum-soft">{mode === "purchase" ? t("inventory.itemsHintPurchase") : mode === "sale" ? t("inventory.itemsHintSale") : ""}</p>
    </div>
  );
}
