"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveProductBuffer } from "@/app/(app)/settings/products-actions";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/**
 * The weekly buy buffer, edited in place on Products (admin). Saves when the
 * field loses focus or Enter is pressed; empty means the default for the unit.
 */
export function BufferInput({ productId, value, fallback, label }: { productId: string; value: number | null; fallback: number; label: string }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(value == null ? "" : String(value));
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();

  const save = () => {
    if (text === (value == null ? "" : String(value))) return;
    start(async () => {
      const r = await saveProductBuffer(productId, text);
      setState(r.ok ? "saved" : "error");
      if (r.ok) router.refresh();
    });
  };

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={1000}
        step={1}
        value={text}
        placeholder={String(fallback)}
        aria-label={label}
        disabled={pending}
        onChange={(e) => {
          setText(e.target.value);
          setState("idle");
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn("h-11 w-16 rounded-xl border bg-card px-2 text-right text-sm tabular text-plum", state === "error" ? "border-berry" : "border-line")}
      />
      {state === "saved" ? <span className="text-xs text-success">{t("common.saved")}</span> : null}
      {state === "error" ? <span className="text-xs text-berry">{t("common.error")}</span> : null}
    </label>
  );
}
