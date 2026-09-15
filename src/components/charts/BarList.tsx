"use client";

import { cn } from "@/lib/cn";

export type BarDatum = { label: string; value: number; display: string; tone?: "berry" | "lavender" | "plum" };

const tones = { berry: "bg-berry", lavender: "bg-lavender", plum: "bg-plum" };

/** Horizontal bars with the value printed next to each. No axis, no library. */
export function BarList({ data, className }: { data: BarDatum[]; className?: string }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <ul className={cn("space-y-2", className)} role="img" aria-label={data.map((d) => `${d.label}: ${d.display}`).join(", ")}>
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs">
          <span className="truncate text-plum-soft">{d.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-ivory-deep">
            <span className={cn("block h-full rounded-full transition-[width]", tones[d.tone ?? "berry"])} style={{ width: `${Math.max(2, (Math.abs(d.value) / max) * 100)}%` }} />
          </span>
          <span className="tabular font-medium text-plum">{d.display}</span>
        </li>
      ))}
    </ul>
  );
}
