"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { InfoIcon } from "./Icons";
import { cn } from "@/lib/cn";

/**
 * Small "i" button that reveals a plain-words explanation on tap or click.
 * Works on touch (no hover needed) and closes on outside tap or Escape.
 */
export function InfoTip({ text, label, className, align = "right" }: { text: string; label?: string; className?: string; /** Which edge of the icon the bubble lines up with; "left" for icons near the left edge of the screen. */ align?: "left" | "right" }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label ?? t("common.whatIsThis")}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn("-m-2 flex h-9 w-9 items-center justify-center rounded-full transition-colors", open ? "text-berry" : "text-plum-faint hover:text-berry")}
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      {open ? (
        <span id={id} role="tooltip" className={cn("absolute top-8 z-20 w-64 max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-card px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-plum shadow-[0_8px_24px_rgba(48,35,51,0.15)]", align === "left" ? "left-0" : "right-0")}>
          {text}
        </span>
      ) : null}
    </span>
  );
}
