import { Pill } from "@/components/ui/Pill";
import type { Translator } from "@/lib/i18n/dictionary";
import type { ProductStock } from "@/lib/inventory/valuation";

/**
 * Stock on hand for one product. A buy-to-order product below zero shows a
 * purchase backlog in berry, never a negative number in red; a stocked product
 * below zero is a data problem and says so.
 */
export function StockPill({ row, tr }: { row: ProductStock; tr: Translator }) {
  const unit = tr(`products.unit.${row.product.unit_label as "box"}`);
  if (row.backlog > 0) {
    if (row.product.stock_mode === "buy_to_order") return <Pill tone="berry">{tr("products.backlogPill", { n: row.backlog })}</Pill>;
    return <Pill tone="warning">{tr("products.negativePill", { n: row.backlog })}</Pill>;
  }
  return (
    <Pill tone={row.low ? "warning" : "success"}>
      {row.onHand} {unit}
    </Pill>
  );
}
