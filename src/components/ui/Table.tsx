import Link from "next/link";
import { cn } from "@/lib/cn";

type Align = "left" | "right" | "center";

/**
 * The table layout rule. Every column declares a content class, which fixes
 * its width (so headers line up with cells and the browser's auto layout never
 * decides), and a priority: primary is always visible, secondary appears from
 * 1280px, tertiary from 1440px. What a narrower screen hides is repeated in
 * the expandable row detail. No table scrolls sideways; below 768px callers
 * render stacked cards instead.
 */
export type ColKind = "date" | "datetime" | "id" | "money" | "num" | "short" | "long" | "pill" | "status" | "action";
export type ColPriority = "primary" | "secondary" | "tertiary";

const KIND_WIDTH: Record<ColKind, string> = {
  date: "w-[7rem]",
  datetime: "w-[10.5rem]",
  id: "w-[11.5rem]",
  money: "w-[7.25rem]",
  num: "w-[5.25rem]",
  short: "w-[8.5rem]",
  long: "",
  pill: "w-[8.5rem]",
  status: "w-[10.5rem]",
  action: "w-[3.5rem]",
};

/** An action column is as wide as its 44px icons plus the cell padding. */
const ACTION_WIDTH: Record<number, string> = { 1: "w-[3.5rem]", 2: "w-[6.25rem]", 3: "w-[9rem]", 4: "w-[11.75rem]" };

const PRIORITY: Record<ColPriority, string> = { primary: "", secondary: "hidden xl:table-cell", tertiary: "hidden wide:table-cell" };

/** Shown only while the matching column is hidden; used inside row details. */
export const WHILE_HIDDEN: Record<ColPriority, string> = { primary: "", secondary: "xl:hidden", tertiary: "wide:hidden" };

const isNumeric = (kind?: ColKind) => kind === "money" || kind === "num";

/**
 * Desktop table. On phones callers render stacked cards instead, so the
 * table is hidden below the lg breakpoint (1024px) unless mobile="show" is passed.
 */
export function Table({ children, className, mobile = "hidden" }: { children: React.ReactNode; className?: string; mobile?: "hidden" | "show" }) {
  return (
    <div className={cn("min-w-0 max-w-full rounded-card border border-line bg-card", mobile === "hidden" ? "hidden lg:block" : "", className)}>
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, align, kind, priority = "primary", icons = 1 }: { children?: React.ReactNode; className?: string; align?: Align; kind?: ColKind; priority?: ColPriority; /** How many 44px icons an action column holds. */ icons?: 1 | 2 | 3 | 4 }) {
  const a = align ?? (isNumeric(kind) ? "right" : "left");
  return (
    <th
      scope="col"
      className={cn(
        "eyebrow border-b border-line bg-ivory-deep/70 px-3 py-3 align-bottom leading-tight [overflow-wrap:normal] first:rounded-tl-card last:rounded-tr-card",
        a === "right" && "text-right",
        a === "center" && "text-center",
        a === "left" && "text-left",
        kind && (kind === "action" ? ACTION_WIDTH[icons] : KIND_WIDTH[kind]),
        PRIORITY[priority],
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align, kind, priority = "primary", title }: { children?: React.ReactNode; className?: string; align?: Align; kind?: ColKind; priority?: ColPriority; /** Tooltip with the full text; defaults to the cell text when it is a plain string. */ title?: string }) {
  const a = align ?? (isNumeric(kind) ? "right" : "left");
  const text = kind === "short" || kind === "long";
  const tip = title ?? (typeof children === "string" ? children : undefined);
  return (
    <td
      className={cn(
        "border-b border-line/70 px-3 py-2.5 align-middle",
        a === "right" && "text-right tabular whitespace-nowrap",
        a === "center" && "text-center",
        (kind === "date" || kind === "datetime" || kind === "id") && "whitespace-nowrap",
        (kind === "date" || kind === "datetime") && "tabular",
        kind === "action" && "px-1.5",
        PRIORITY[priority],
        className,
      )}
    >
      {text ? (
        <div className="line-clamp-2 [overflow-wrap:anywhere]" title={tip}>
          {children}
        </div>
      ) : (
        children
      )}
    </td>
  );
}

/** An action as an icon with a tooltip and a 44px target, so a narrow column never clips a word. */
export function IconLink({ href, label, children, className }: { href: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} aria-label={label} title={label} className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-plum-soft transition-colors hover:bg-lavender-soft hover:text-berry", className)}>
      {children}
    </Link>
  );
}

/** Label and value list inside an expanded row. An item with a priority shows only while its column is hidden. */
export function RowDetail({ items, children }: { items: { label: string; value: React.ReactNode; priority?: ColPriority; wide?: boolean }[]; children?: React.ReactNode }) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== "" && i.value !== false);
  return (
    <div>
      <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2 xl:grid-cols-3">
        {shown.map((i) => (
          <div key={i.label} className={cn("min-w-0", i.wide && "md:col-span-2 xl:col-span-3", WHILE_HIDDEN[i.priority ?? "primary"])}>
            <dt className="eyebrow text-[0.62rem]">{i.label}</dt>
            <dd className="mt-0.5 text-plum [overflow-wrap:anywhere]">{i.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
