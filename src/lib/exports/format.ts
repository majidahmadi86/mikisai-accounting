import type { ColumnKind } from "./tables";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Display string for one cell. Shared by the page and the PDF so they print identical text. */
export function formatCell(value: string | number | null, kind: ColumnKind): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (kind === "money") return `${value < 0 ? "-" : ""}฿${money.format(Math.abs(value))}`;
    if (kind === "pct") return `${value.toFixed(2)}%`;
    return String(value);
  }
  return value;
}
