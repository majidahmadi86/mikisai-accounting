import { cn } from "@/lib/cn";

export type PillTone = "sage" | "clay" | "gold" | "neutral" | "ink";

const tones: Record<PillTone, string> = {
  sage: "bg-sage-tint text-sage-deep",
  clay: "bg-clay-tint text-clay",
  gold: "bg-gold-tint text-[#8a6620]",
  neutral: "bg-porcelain-deep text-ink-soft",
  ink: "bg-ink text-porcelain",
};

export function Pill({ tone = "neutral", children, className }: { tone?: PillTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
