"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameProduct } from "@/app/(app)/settings/products-actions";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/** Name a product where it is seen: a short name that replaces the bare size in every list. Admin only. */
export function InlineRename({ productId, current, compact = false }: { productId: string; current: string; compact?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(!current);
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="min-h-8 text-xs font-medium text-berry hover:underline"
      >
        {t("products.rename")}
      </button>
    );
  }
  return (
    <form
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const r = await renameProduct(productId, value);
          if (!r.ok) return setError(t("common.error"));
          setError(null);
          setOpen(false);
          router.refresh();
        });
      }}
      className={cn("flex items-center gap-1.5", compact ? "mt-1" : "mt-2")}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.preventDefault()}
        placeholder={t("products.renamePlaceholder")}
        maxLength={40}
        aria-label={t("products.rename")}
        className="min-h-9 w-40 rounded-lg border border-line bg-card px-2.5 text-sm text-plum focus:border-berry focus:outline-none"
      />
      <button type="submit" disabled={pending || !value.trim()} className="min-h-9 rounded-full bg-berry px-3 text-xs font-medium text-ivory disabled:opacity-50">
        {t("common.save")}
      </button>
      {error ? <span className="text-xs text-berry">{error}</span> : null}
    </form>
  );
}
