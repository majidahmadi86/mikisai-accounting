import { cn } from "@/lib/cn";

export type CardTone = "card" | "sage" | "clay" | "gold" | "porcelain";

const tones: Record<CardTone, string> = {
  card: "bg-card border border-line",
  sage: "bg-sage-tint border border-sage/20",
  clay: "bg-clay-tint border border-clay/20",
  gold: "bg-gold-tint border border-gold/25",
  porcelain: "bg-porcelain-deep border border-line",
};

export function Card({ className, children, tone = "card" }: { className?: string; children: React.ReactNode; tone?: CardTone }) {
  return <div className={cn("rounded-card shadow-[0_1px_2px_rgba(43,42,40,0.04)]", tones[tone], className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
      <div>
        <h2 className="text-xl text-ink">{title}</h2>
        {subtitle ? <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
