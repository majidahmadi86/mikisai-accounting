"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { useLocale, useT } from "@/lib/i18n/client";
import { pickerParts } from "@/lib/inventory/units";
import type { Product } from "@/lib/inventory/valuation";
import { productName } from "@/lib/labels";
import { cn } from "@/lib/cn";

/** One picker row: variant first, then the product name, then the product line as a pill. */
export function PickerRow({ p }: { p: Product }) {
  const t = useT();
  const locale = useLocale();
  const parts = pickerParts(p, locale);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left">
      <span className="font-medium text-plum [overflow-wrap:anywhere]">{parts.variant}</span>
      {parts.variant && parts.name ? <span className="text-plum-faint">·</span> : null}
      <span className="text-plum-soft [overflow-wrap:anywhere]">{parts.name}</span>
      <Pill tone="lavender" className="px-2 py-0 text-[10px]">
        {productName(t, p.product_line)}
      </Pill>
    </span>
  );
}

/**
 * A product chooser that cannot be confused: every row shows the variant
 * first, then the product name, with the product line as a small pill, and
 * nothing is truncated. Optional "create" row at the bottom for a new product.
 */
export function ProductPicker({ products, value, onChange, label, createLabel, onCreate, className, id }: { products: Product[]; value: string; onChange: (id: string) => void; label: string; createLabel?: string; onCreate?: () => void; className?: string; id?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const selected = products.find((p) => p.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <span className="eyebrow mb-1 block">{label}</span>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-card px-3.5 py-2 text-sm text-plum focus:border-berry focus:outline-none focus:ring-2 focus:ring-lavender"
      >
        {selected ? <PickerRow p={selected} /> : <span className="text-plum-faint">{t("inventory.pickProduct")}</span>}
        <span className={cn("shrink-0 text-plum-faint transition-transform", open && "rotate-90")}>→</span>
      </button>
      {open ? (
        <ul id={listId} role="listbox" aria-label={label} className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-[0_8px_30px_rgba(48,35,51,0.15)]">
          {products.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={cn("flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-sm hover:bg-lavender-tint", p.id === value && "bg-lavender-tint")}
              >
                <PickerRow p={p} />
              </button>
            </li>
          ))}
          {onCreate ? (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  onCreate();
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-berry hover:bg-lavender-tint"
              >
                + {createLabel ?? t("inventory.newProduct")}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
