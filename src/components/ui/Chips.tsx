"use client";

import { cn } from "@/lib/cn";

export type ChipOption<T extends string> = { value: T; label: string };

/**
 * One-tap choice group. Each chip is at least 44px tall so it is a safe
 * touch target; the selected chip is filled berry.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  name,
  label,
  className,
  size = "md",
}: {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  name?: string;
  label: string;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors select-none",
              size === "lg" && "min-h-12 flex-1 text-base",
              selected ? "border-berry bg-berry text-ivory" : "border-line bg-card text-plum hover:border-plum-faint hover:bg-lavender-tint",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
