"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** "3 items" that expands to one line per product; a single item shows inline. */
export function ItemsSummary({ label, lines, className }: { label: string; lines: string[]; className?: string }) {
  const [open, setOpen] = useState(false);
  if (lines.length <= 1) return <span className={className}>{label}</span>;
  return (
    <span className={cn("inline", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex min-h-6 items-center gap-1 font-medium text-berry"
        aria-expanded={open}
      >
        {label} <span className={cn("text-[10px] transition-transform", open && "rotate-90")}>→</span>
      </button>
      {open ? (
        <span className="mt-1 block space-y-0.5">
          {lines.map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
