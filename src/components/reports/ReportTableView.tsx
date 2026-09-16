import type { ExportTable } from "@/lib/exports/tables";
import { formatCell } from "@/lib/exports/format";
import { Table, Td, Th } from "@/components/ui/Table";
import { cn } from "@/lib/cn";

export function rowsWithTotal(table: ExportTable): { cells: string[]; total: boolean; emphasis: boolean }[] {
  const emphasis = new Set(table.emphasis ?? []);
  const rows = table.rows.map((r, ri) => ({ cells: r.map((v, i) => formatCell(v, table.columns[i].kind)), total: false, emphasis: emphasis.has(ri) }));
  if (table.totals.length && table.rows.length) {
    rows.push({
      cells: table.columns.map((c, i) => {
        if (i === 0) return table.totalLabel;
        if (!table.totals.includes(i)) return "";
        const sum = table.rows.reduce((a, r) => a + (typeof r[i] === "number" ? (r[i] as number) : 0), 0);
        return formatCell(Math.round(sum * 100) / 100, c.kind);
      }),
      total: true,
      emphasis: false,
    });
  }
  return rows;
}

/** Renders one report table: a real table from md up, one card per row on phones. */
export function ReportTableView({ table }: { table: ExportTable }) {
  const rows = rowsWithTotal(table);
  const isNum = (i: number) => table.columns[i].kind !== "text" && table.columns[i].kind !== "date";

  return (
    <>
      <ul className="space-y-2 md:hidden">
        {rows.map((r, ri) => (
          <li key={ri} className={cn("rounded-xl border px-4 py-3", r.total ? "border-berry/30 bg-berry-tint" : r.emphasis ? "border-lavender bg-lavender-tint" : "border-line bg-card")}>
            <p className={cn("text-sm font-medium", r.total ? "text-berry" : "text-plum")}>{r.cells[0]}</p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
              {r.cells.slice(1).map((v, i) =>
                v === "" ? null : (
                  <div key={i} className={cn("flex items-baseline justify-between gap-2 text-xs", table.columns[i + 1].kind === "text" && "col-span-2")}>
                    <dt className="eyebrow shrink-0 text-[0.6rem]">{table.columns[i + 1].label}</dt>
                    <dd className={cn("min-w-0 text-right text-plum", table.columns[i + 1].kind === "text" ? "[overflow-wrap:anywhere]" : "tabular whitespace-nowrap", r.total && "font-medium text-berry")}>{v}</dd>
                  </div>
                ),
              )}
            </dl>
          </li>
        ))}
      </ul>
      <Table>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <Th key={c.key} align={isNum(i) ? "right" : "left"}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={cn(r.total ? "bg-berry-tint font-medium text-berry" : r.emphasis ? "bg-lavender-tint font-medium" : ri % 2 === 1 ? "bg-ivory-deep/50" : "")}>
              {r.cells.map((v, i) => (
                <Td key={i} align={isNum(i) ? "right" : "left"} className={cn(i === 0 && !r.total && "text-plum")}>
                  {v}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
