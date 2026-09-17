import { describe, expect, it } from "vitest";
import { isoWeek, shortPeriodLabel } from "@/lib/inventory/units-labels";

const dash = String.fromCharCode(8211);

describe("units period labels", () => {
  it("are short and single line", () => {
    expect(shortPeriodLabel("2026-09-15", "2026-09-15", "day", "en")).toBe("15 Sept");
    expect(shortPeriodLabel("2026-09-14", "2026-09-20", "week", "en")).toBe(`Wk 38 · 14${dash}20 Sept`);
    expect(shortPeriodLabel("2026-09-28", "2026-10-04", "week", "en")).toBe(`Wk 40 · 28 Sept${dash}4 Oct`);
    expect(shortPeriodLabel("2026-09-01", "2026-09-30", "month", "en")).toBe("Sept 2026");
    expect(shortPeriodLabel("2026-09-03", "2026-09-16", "total", "en")).toBe(`Total · 3${dash}16 Sept`);
    expect(shortPeriodLabel("2026-09-01", "2026-09-30", "month", "th")).toBe("ก.ย. 2569");
  });

  it("computes ISO week numbers", () => {
    expect(isoWeek("2026-09-14")).toBe(38);
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2027-01-01")).toBe(53);
  });
});
