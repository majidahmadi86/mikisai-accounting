"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/**
 * A table row whose last cell holds its actions and a chevron. The chevron
 * opens a detail row under it: the full product name, the note, and every
 * column the current width hides. The detail spans however many columns are
 * visible right now, so it stays correct when the window is resized.
 */
export function ExpandableRow({ children, detail, actions, className, label }: { children: React.ReactNode; detail: React.ReactNode; actions?: React.ReactNode; className?: string; /** What the row is, for the chevron's accessible name. */ label?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [span, setSpan] = useState(1);
  const row = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!open) return;
    const measure = () => setSpan(Math.max(1, Array.from(row.current?.cells ?? []).filter((c) => c.offsetWidth > 0).length));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  const name = open ? t("table.hideDetail") : t("table.showDetail");
  return (
    <>
      <tr ref={row} className={cn("hover:bg-lavender-tint", open && "bg-lavender-tint", className)}>
        {children}
        <td className={cn("border-b border-line/70 px-1.5 py-1 align-middle", open && "border-b-transparent")}>
          <div className="flex items-center justify-end">
            {actions}
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={label ? `${name}: ${label}` : name} title={name} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-plum-soft transition-colors hover:bg-lavender-soft hover:text-berry">
              <ChevronDownIcon className={cn("h-5 w-5 transition-transform", open && "rotate-180")} />
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr className={cn("bg-lavender-tint", className)}>
          <td colSpan={span} className="border-b border-line/70 px-3 pb-4 pt-1">
            {detail}
          </td>
        </tr>
      ) : null}
    </>
  );
}
