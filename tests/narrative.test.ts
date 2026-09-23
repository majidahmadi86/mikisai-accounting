import { describe, expect, it } from "vitest";
import { narrativeMatchesFacts } from "@/lib/insights/narrative";

const facts = {
  as_of: "2026-09-22",
  by_product: [{ product: "Mali brand · 100% pure coconut sugar · 1 kg bag (box of 10 bags)", units_this_month: 1, margin_this_month: 39.33 }],
  products: [{ product: "sugar", units_30d: 53, profit_30d: 3119.46, margin_per_unit: 58.86, trend: "rising", tag: "push", drift_drop_pct: null, best_platform: "tiktok" }],
  cash_waiting_total: 4253.09,
  cash: [{ platform: "tiktok", waiting: 4253.09, next_7_days: 2800.5, overdue: 0, usual_lag_days: 10 }],
  exceptions: 0,
} as const;

describe("Insights paragraph: only the numbers on the page", () => {
  it("shows a paragraph quoting today's figures", () => {
    expect(narrativeMatchesFacts("Sugar kept ฿59 per unit and made ฿3,119.46; ฿4,253.09 is still to arrive, ฿2,800.50 this week.", facts as never)).toBe(true);
  });
  it("names a product and its margin from the facts", () => {
    expect(narrativeMatchesFacts("Mali brand · 100% pure coconut sugar · 1 kg bag (box of 10 bags) earned ฿39.33 this month.", facts as never)).toBe(true);
  });

  it("hides one quoting a figure that is not there (yesterday's 17,992)", () => {
    expect(narrativeMatchesFacts("You sold 66 units and ฿17,992 is waiting.", facts as never)).toBe(false);
  });
});
