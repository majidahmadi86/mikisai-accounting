"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/**
 * Free text in a list row: wraps anywhere (so a 300 character note can never
 * widen its card), clamps to two lines, and offers "more" to expand.
 */
export function ExpandableNote({ text, className }: { text: string; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 90;
  return (
    <span className={cn("block min-w-0 [overflow-wrap:anywhere]", className)}>
      <span className={!open && long ? "line-clamp-2" : "block"}>{text}</span>
      {long ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="mt-0.5 inline-flex min-h-8 items-center text-xs font-medium text-berry"
        >
          {open ? t("common.less") : t("common.more")}
        </button>
      ) : null}
    </span>
  );
}
