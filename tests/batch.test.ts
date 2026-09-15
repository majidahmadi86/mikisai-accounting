import { describe, expect, it } from "vitest";
import { chunk, isOrderStart, MAX_ORDERS_PER_BATCH, splitTextIntoBatches } from "@/lib/parse/batch";
import { estimateNet } from "@/lib/parse/estimate";

function fakeOrders(n: number, thai = false): string {
  return Array.from({ length: n }, (_, i) =>
    thai
      ? `หมายเลขคำสั่งซื้อ 5791${String(i).padStart(8, "0")}\nลูกค้า: คุณ ${i}\nยอดรวม ฿350.00\nยอดเงินโดยประมาณที่จะได้รับ ฿315.00\nสถานะ: รอโอน`
      : `Order ID: 5791${String(i).padStart(8, "0")}\nBuyer: user${i}\nTotal: ฿350.00\nEstimated amount you receive: ฿315.00\nStatus: Pending`,
  ).join("\n\n");
}

describe("isOrderStart", () => {
  it("recognises English and Thai order headers", () => {
    expect(isOrderStart("Order ID: 579100000001")).toBe(true);
    expect(isOrderStart("Order no. 12345")).toBe(true);
    expect(isOrderStart("หมายเลขคำสั่งซื้อ 579100000001")).toBe(true);
    expect(isOrderStart("เลขที่ออเดอร์ 12345")).toBe(true);
    expect(isOrderStart("#12345")).toBe(true);
    expect(isOrderStart("Total: ฿350.00")).toBe(false);
    expect(isOrderStart("ยอดรวม ฿350.00")).toBe(false);
  });
});

describe("splitTextIntoBatches", () => {
  it("returns nothing for empty input", () => {
    expect(splitTextIntoBatches("   \n ")).toEqual([]);
  });

  it("keeps a short report in one batch", () => {
    expect(splitTextIntoBatches(fakeOrders(5))).toHaveLength(1);
  });

  it("never puts more than the max orders in one batch", () => {
    const batches = splitTextIntoBatches(fakeOrders(40));
    expect(batches).toHaveLength(3);
    for (const b of batches) {
      expect((b.match(/Order ID:/g) ?? []).length).toBeLessThanOrEqual(MAX_ORDERS_PER_BATCH);
    }
    expect(batches[0].match(/Order ID:/g)).toHaveLength(18);
    expect(batches[2].match(/Order ID:/g)).toHaveLength(4);
  });

  it("splits Thai reports on Thai order headers", () => {
    const batches = splitTextIntoBatches(fakeOrders(20, true));
    expect(batches).toHaveLength(2);
    expect(batches[1].match(/หมายเลขคำสั่งซื้อ/g)).toHaveLength(2);
  });

  it("keeps a preamble attached to the first batch", () => {
    const text = `TikTok Shop report for September\n\n${fakeOrders(3)}`;
    const batches = splitTextIntoBatches(text);
    expect(batches[0].startsWith("TikTok Shop report")).toBe(true);
  });

  it("falls back to size-based chunking when no headers are found", () => {
    const paragraph = "ยอดรวม ฿350.00 ลูกค้า คุณ A\n".repeat(30);
    const text = Array.from({ length: 6 }, () => paragraph).join("\n\n");
    const batches = splitTextIntoBatches(text, { maxChars: 2000 });
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) expect(b.length).toBeLessThanOrEqual(2000);
  });
});

describe("chunk", () => {
  it("groups images four at a time", () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
  });
});

describe("estimateNet", () => {
  const settings = [
    { platform: "tiktok" as const, commission_pct: 8, fixed_fee: 0 },
    { platform: "shopee" as const, commission_pct: 10, fixed_fee: 5 },
  ];
  it("applies commission and fixed fee", () => {
    expect(estimateNet(1000, "tiktok", settings)).toBe(920);
    expect(estimateNet(1000, "shopee", settings)).toBe(895);
  });
  it("uses gross when no setting exists and never goes negative", () => {
    expect(estimateNet(100, "fb", settings)).toBe(100);
    expect(estimateNet(2, "shopee", settings)).toBe(0);
  });
});
