import { describe, expect, it } from "vitest";
import { REPORT_TODAY, seedLedger } from "@/lib/fixtures/report-data";
import { buildCashForecast, buildExceptions, buildInsights, buildProductInsights, DEFAULT_LAG_DAYS, observedLagDays } from "@/lib/insights/compute";
import type { ReportTx } from "@/lib/reports/build";

function income(id: string, date: string, product: ReportTx["product_line"], net: number, quantity = 1, platform: ReportTx["platform"] = "tiktok", status: "pending" | "received_in_bank" = "pending", settledAt?: string): ReportTx {
  return {
    id,
    type: "income",
    date,
    platform,
    product_line: product,
    gross_amount: net,
    net_amount: net,
    quantity,
    payer: null,
    received_by: "mike",
    category: null,
    customer_name: null,
    note: "",
    created_at: `${date}T00:00:00Z`,
    settlement: { status, settled_at: settledAt ?? null, payout_id: null },
  };
}

describe("product insights", () => {
  it("ranks by 30-day profit and tags the leader as push", () => {
    const rows = buildProductInsights(seedLedger().transactions, REPORT_TODAY);
    expect(rows.map((r) => r.product)).toEqual(["skincare", "sugar"]);
    expect(rows[0].profit30).toBe(1401);
    expect(rows[0].marginPerUnit30).toBe(700.5);
    expect(rows[0].tag).toBe("push");
    expect(rows[1].netPerUnit30).toBe(261);
    expect(rows[1].bestPlatform?.platform).toBe("tiktok");
  });

  it("flags margin drift when the last 7 days earn 10%+ less per unit than the 30-day average", () => {
    const tx = [
      income("a", "2026-09-01", "sugar", 100),
      income("b", "2026-09-05", "sugar", 100),
      income("c", "2026-09-08", "sugar", 100),
      income("d", "2026-09-14", "sugar", 70),
      income("e", "2026-09-15", "sugar", 70),
    ];
    const [sugar] = buildProductInsights(tx, REPORT_TODAY);
    expect(sugar.drift).toEqual({ current: 70, baseline: 88, dropPct: 20.45 });
    expect(sugar.tag).toBe("review_pricing");
  });

  it("detects rising and falling velocity", () => {
    const rising = [income("a", "2026-09-01", "sugar", 100), income("b", "2026-09-14", "sugar", 100, 3), income("c", "2026-09-15", "sugar", 100, 3)];
    expect(buildProductInsights(rising, REPORT_TODAY)[0].trend).toBe("rising");
    const falling = [income("a", "2026-08-20", "sugar", 100, 3), income("b", "2026-08-25", "sugar", 100, 3), income("c", "2026-09-01", "sugar", 100, 2)];
    expect(buildProductInsights(falling, REPORT_TODAY)[0].trend).toBe("falling");
  });

  it("picks the platform with the highest net per order", () => {
    const tx = [income("a", "2026-09-01", "sugar", 90, 1, "tiktok"), income("b", "2026-09-02", "sugar", 100, 1, "shopee"), income("c", "2026-09-03", "sugar", 90, 1, "shopee")];
    expect(buildProductInsights(tx, REPORT_TODAY)[0].bestPlatform).toEqual({ platform: "shopee", netPerOrder: 95, orders: 2 });
  });
});

describe("cash forecast", () => {
  it("uses the observed median lag per platform and the default elsewhere", () => {
    const lag = observedLagDays(seedLedger().transactions, REPORT_TODAY);
    // tt1 1 Sep -> 10 Sep = 9 days, tt2 2 Sep -> 10 Sep = 8 days, median 8.5 rounds to 9
    expect(lag.tiktok).toEqual({ days: 9, observed: true });
    expect(lag.fb).toEqual({ days: 0, observed: true });
    expect(lag.shopee).toEqual({ days: DEFAULT_LAG_DAYS, observed: false });
  });

  it("buckets waiting money into overdue, next 7 days and later", () => {
    const rows = buildCashForecast(seedLedger().transactions, REPORT_TODAY);
    expect(rows).toHaveLength(1);
    const shopee = rows[0];
    expect(shopee.platform).toBe("shopee");
    expect(shopee.pending).toBe(801);
    // 3 Sep + 10 days = 13 Sep, before today: overdue.
    expect(shopee.overdue).toBe(801);
    expect(shopee.nextArrival).toBe(REPORT_TODAY);

    const fresh = buildCashForecast([income("x", "2026-09-15", "sugar", 500, 1, "shopee")], REPORT_TODAY);
    expect(fresh[0].later).toBe(500);
    expect(fresh[0].nextArrival).toBe("2026-09-25");
  });
});

describe("exceptions", () => {
  it("lists unmatched payouts and orders waiting more than 20 days", () => {
    const input = seedLedger();
    input.payouts.push({ id: "p2", date: "2026-09-12", platform: "shopee", amount_received: 500, received_by: "sai", note: "" });
    input.transactions.push(income("old", "2026-08-01", "sugar", 200, 1, "shopee"));
    const ex = buildExceptions(input, REPORT_TODAY);
    expect(ex.map((e) => e.kind)).toEqual(["stale_order", "unmatched_payout"]);
    expect(ex[0]).toMatchObject({ id: "old", days: 46 });
    expect(ex[1]).toMatchObject({ id: "p2", amount: 500 });
  });

  it("bundle totals", () => {
    const i = buildInsights(seedLedger(), REPORT_TODAY);
    expect(i.cashTotal).toBe(801);
    expect(i.exceptions).toEqual([]);
    expect(i.drifting).toEqual([]);
  });
});
