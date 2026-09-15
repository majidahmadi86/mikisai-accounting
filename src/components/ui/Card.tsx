import { cn } from "@/lib/cn";

export type CardTone = "card" | "berry" | "lavender" | "ivory" | "success" | "warning";

const tones: Record<CardTone, string> = {
  card: "bg-card border border-line",
  berry: "bg-berry-tint border border-berry/15",
  lavender: "bg-lavender-tint border border-lavender/60",
  ivory: "bg-ivory-deep border border-line",
  success: "bg-success-tint border border-success/20",
  warning: "bg-warning-tint border border-warning/25",
};

export function Card({ className, children, tone = "card" }: { className?: string; children: React.ReactNode; tone?: CardTone }) {
  return <div className={cn("rounded-card shadow-[0_1px_2px_rgba(48,35,51,0.05)]", tones[tone], className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-xl text-plum">{title}</h2>
        {subtitle ? <p className="text-sm text-plum-soft mt-0.5">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
