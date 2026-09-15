import { cn } from "@/lib/cn";

export type PillTone = "berry" | "berry-soft" | "lavender" | "plum" | "neutral" | "success" | "warning";

const tones: Record<PillTone, string> = {
  berry: "bg-berry text-ivory",
  "berry-soft": "bg-berry-tint text-berry",
  lavender: "bg-lavender-soft text-plum",
  plum: "bg-plum text-ivory",
  neutral: "bg-ivory-deep text-plum-soft",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
};

/** Status pills always carry words, never colour alone. */
export function Pill({ tone = "neutral", children, className }: { tone?: PillTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
