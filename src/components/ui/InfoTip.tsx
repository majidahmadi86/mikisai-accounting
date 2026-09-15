"use client";

import { useEffect, useId, useRef, useState } from "react";
import { InfoIcon } from "./Icons";
import { cn } from "@/lib/cn";

/**
 * Small "i" button that reveals a plain-words explanation on tap or click.
 * Works on touch (no hover needed) and closes on outside tap or Escape.
 */
export function InfoTip({ text, label = "What is this?", className }: { text: string; label?: string; className?: string }) {
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
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn("-m-2 flex h-9 w-9 items-center justify-center rounded-full transition-colors", open ? "text-berry" : "text-plum-faint hover:text-berry")}
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      {open ? (
        <span id={id} role="tooltip" className="absolute right-0 top-8 z-20 w-64 rounded-xl border border-line bg-card px-3 py-2 text-left text-xs leading-relaxed text-plum shadow-[0_8px_24px_rgba(48,35,51,0.15)]">
          {text}
        </span>
      ) : null}
    </span>
  );
}
