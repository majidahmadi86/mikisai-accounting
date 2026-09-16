import { cn } from "@/lib/cn";

type Align = "left" | "right" | "center";

/**
 * Desktop table. On phones callers render stacked cards instead, so the
 * table is hidden below the md breakpoint unless mobile="scroll" is passed.
 */
export function Table({ children, className, mobile = "hidden" }: { children: React.ReactNode; className?: string; mobile?: "hidden" | "scroll" }) {
  return (
    <div className={cn("min-w-0 max-w-full overflow-x-auto rounded-card border border-line bg-card", mobile === "hidden" ? "hidden md:block" : "", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: Align }) {
  return (
    <th
      className={cn(
        "eyebrow border-b border-line bg-ivory-deep/70 px-4 py-3 whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: Align }) {
  return (
    <td
      className={cn(
        "border-b border-line/70 px-4 py-3 align-middle",
        align === "right" && "text-right tabular whitespace-nowrap",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}
