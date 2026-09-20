import { cn } from "@/lib/cn";

/** Phone counterpart of Table: one card per row, shown below the lg breakpoint (1024px). */
export function StackedList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("space-y-2 lg:hidden", className)}>{children}</ul>;
}

export function StackedItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <li className={cn("min-w-0 rounded-card border border-line bg-card px-4 py-3", className)}>{children}</li>;
}

/** Label and value pair inside a stacked card. */
export function StackedRow({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 text-sm", className)}>
      <span className="eyebrow shrink-0">{label}</span>
      <span className="min-w-0 text-right text-plum">{children}</span>
    </div>
  );
}
