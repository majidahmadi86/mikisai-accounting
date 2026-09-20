import type { Column, ExportTable } from "@/lib/exports/tables";
import { formatCell } from "@/lib/exports/format";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { RowDetail, Table, Td, Th, type ColKind } from "@/components/ui/Table";
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

/** Content class of a report column: the first text column takes the free width, later text columns are short. */
export function colKind(c: Column, index: number, columns: Column[]): ColKind {
  if (c.kind === "money") return "money";
  if (c.kind === "int" || c.kind === "pct") return "num";
  if (c.kind === "date") return "date";
  return index === columns.findIndex((x) => x.kind === "text") ? "long" : "short";
}

/**
 * Renders one report table: a real table from md up, one card per row on
 * phones. Columns marked secondary or tertiary hide on narrower screens and
 * reappear in the expandable row detail, so the table never scrolls sideways.
 */
export function ReportTableView({ table }: { table: ExportTable }) {
  const rows = rowsWithTotal(table);
  const kinds = table.columns.map((c, i, all) => colKind(c, i, all));
  const expandable = table.columns.some((c) => c.priority && c.priority !== "primary");

  return (
    <>
      <ul className="space-y-2 lg:hidden">
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
              <Th key={c.key} kind={kinds[i]} priority={c.priority}>
                {c.label}
              </Th>
            ))}
            {expandable ? (
              <Th kind="action">
                <span className="sr-only">{table.title}</span>
              </Th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const tone = r.total ? "bg-berry-tint font-medium text-berry" : r.emphasis ? "bg-lavender-tint font-medium" : ri % 2 === 1 ? "bg-ivory-deep/50" : "";
            const cells = r.cells.map((v, i) => (
              <Td key={i} kind={kinds[i]} priority={table.columns[i].priority} className={cn(i === 0 && !r.total && "text-plum")}>
                {v}
              </Td>
            ));
            if (!expandable) {
              return (
                <tr key={ri} className={tone}>
                  {cells}
                </tr>
              );
            }
            return (
              <ExpandableRow key={ri} className={tone} label={r.cells[0]} detail={<RowDetail items={table.columns.map((c, i) => ({ label: c.label, value: r.cells[i], priority: c.priority, wide: i === 0 })).filter((x, i) => i === 0 || x.priority)} />}>
                {cells}
              </ExpandableRow>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
