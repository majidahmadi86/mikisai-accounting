"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/** The platform order number with a one-tap copy. Stops the click from following the row link. */
export function CopyRef({ value, className }: { value: string; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={t("common.copy")}
      aria-label={`${t("common.copy")} ${value}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={cn("inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-line bg-card px-2 font-mono text-[11px] text-plum hover:border-berry hover:text-berry", className)}
    >
      <span className="truncate">#{value}</span>
      <span className="shrink-0 text-[10px] text-plum-faint">{copied ? t("common.copied") : "⧉"}</span>
    </button>
  );
}
