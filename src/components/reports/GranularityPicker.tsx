import Link from "next/link";
import type { Translator } from "@/lib/i18n/dictionary";
import type { Granularity } from "@/lib/inventory/units";
import { cn } from "@/lib/cn";

const chip = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors";

export function GranularityPicker({ value, qs, tr }: { value: Granularity; qs: string; tr: Translator }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["day", "week", "month"] as const).map((g) => (
        <Link key={g} href={`/reports/units?${qs}&granularity=${g}`} className={cn(chip, value === g ? "border-plum bg-plum text-ivory" : "border-line text-plum-soft hover:border-plum-faint")}>
          {tr(`units.${g}`)}
        </Link>
      ))}
    </div>
  );
}
