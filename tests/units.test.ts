import { describe, expect, it } from "vitest";
import { buildYesterday } from "@/lib/dashboard/yesterday";
import { BOX_ID, REAL_TODAY, realLedger } from "@/lib/fixtures/real-sept";
import { buildUnitsReport, last14Days, summariseItems } from "@/lib/inventory/units";

const input = realLedger();
const unitsInput = { products: input.products, movements: input.movements, items: input.items ?? [], sales: input.transactions.filter((t) => t.type === "income").map((t) => ({ id: t.id, date: t.date })) };

describe("units report", () => {
  const report = buildUnitsReport(unitsInput, last14Days(REAL_TODAY), "day");
  const box = (kind: string, date: string) => report.rows.find((r) => r.kind === kind && r.product.id === BOX_ID && r.to === date);

  it("one row per product per day: 15 Sept sold 13 units in 9 orders, 16 Sept bought 12", () => {
    const sold = box("day", "2026-09-15")!;
    expect(sold.orders).toBe(9);
    expect(sold.unitsSold).toBe(13);
    expect(sold.avgSalePrice).toBe(399);
    expect(sold.onHandEnd).toBe(0);
    expect(sold.backlogEnd).toBe(13);
    const bought = box("day", "2026-09-16")!;
    expect(bought.unitsBought).toBe(12);
    expect(bought.backlogEnd).toBe(1);
    expect(bought.avgCostEnd).toBe(260);
  });

  it("weekly and monthly subtotals and a period total per product", () => {
    const week = report.rows.find((r) => r.kind === "week" && r.product.id === BOX_ID)!;
    expect([week.from, week.to]).toEqual(["2026-09-14", "2026-09-16"]);
    expect(week.unitsSold).toBe(13);
    expect(week.unitsBought).toBe(12);
    const month = report.rows.find((r) => r.kind === "month" && r.product.id === BOX_ID)!;
    expect(month.unitsSold).toBe(13);
    const total = report.totals.find((r) => r.product.id === BOX_ID)!;
    expect(total.orders).toBe(9);
    expect(total.samplesOut).toBe(0);
    expect(report.totals.filter((r) => r.product.name.startsWith("Sample")).reduce((a, r) => a + r.samplesOut, 0)).toBe(3);
  });

  it("week granularity collapses the days", () => {
    const weekly = buildUnitsReport(unitsInput, last14Days(REAL_TODAY), "week");
    expect(weekly.rows.filter((r) => r.kind === "week" && r.product.id === BOX_ID)).toHaveLength(1);
    expect(weekly.rows.find((r) => r.product.id === BOX_ID)!.unitsSold).toBe(13);
  });
});

describe("ledger row item labels", () => {
  const products = new Map(input.products.map((p) => [p.id, p]));
  it("one product shows variant x qty; several show a count", () => {
    expect(summariseItems([{ product_id: BOX_ID, qty: 2 }], products)!.label).toBe("10 kg box (1 kg x 10 packs) × 2");
    const many = summariseItems(
      [
        { product_id: BOX_ID, qty: 1 },
        { product_id: input.products[1].id, qty: 1 },
        { product_id: input.products[2].id, qty: 1 },
      ],
      products,
      "en",
      (n) => `${n} items`,
    )!;
    expect(many.label).toBe("3 items");
    expect(many.lines).toHaveLength(3);
    expect(summariseItems([], products)).toBeNull();
  });
});

describe("home yesterday card", () => {
  it("counts yesterday's orders and units and lists what to buy today", () => {
    const y = buildYesterday({ ...input, items: input.items ?? [] }, REAL_TODAY);
    expect(y.date).toBe("2026-09-15");
    expect(y.orders).toBe(9);
    expect(y.units).toBe(13);
    expect(y.revenue).toBe(13 * 377);
    expect(y.perProduct[0]).toMatchObject({ units: 13 });
    expect(y.toBuy).toEqual([{ product: input.products[0], units: 1 }]);
  });
});
