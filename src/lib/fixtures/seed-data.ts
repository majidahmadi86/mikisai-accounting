/**
 * Shared sample data for scripts/seed.ts and the unit tests, so the numbers
 * the dashboard shows after seeding are the numbers the tests assert.
 */
import type { ExpenseCategory, Person, Platform, ProductLine, SettlementStatus } from "@/lib/types";

export const SEED_BUSINESS_ID = "00000000-0000-4000-8000-000000000001";

export type SeedTransaction = {
  ref: string;
  type: "income" | "expense";
  date: string;
  platform: Platform;
  product_line: ProductLine;
  gross_amount: number;
  net_amount: number;
  received_by: Person | null;
  payer: Person | null;
  category: ExpenseCategory | null;
  customer_name: string | null;
  note: string;
  /** Settlement status after the seeded payout has been reconciled. Income only. */
  status_after_payout: SettlementStatus | null;
};

export const SEED_TRANSACTIONS: SeedTransaction[] = [
  { ref: "tt1", type: "income", date: "2026-09-01", platform: "tiktok", product_line: "sugar", gross_amount: 350, net_amount: 315, received_by: "mike", payer: null, category: null, customer_name: "Nong Pim", note: "Coconut sugar 500g x2", status_after_payout: "received_in_bank" },
  { ref: "tt2", type: "income", date: "2026-09-02", platform: "tiktok", product_line: "sugar", gross_amount: 520, net_amount: 468, received_by: "mike", payer: null, category: null, customer_name: "Khun Ploy", note: "Coconut sugar 1kg x2", status_after_payout: "received_in_bank" },
  { ref: "sp1", type: "income", date: "2026-09-03", platform: "shopee", product_line: "skincare", gross_amount: 890, net_amount: 801, received_by: "sai", payer: null, category: null, customer_name: "Bee", note: "Serum 30ml", status_after_payout: "settled_not_withdrawn" },
  { ref: "fb1", type: "income", date: "2026-09-04", platform: "fb", product_line: "skincare", gross_amount: 1200, net_amount: 1200, received_by: "sai", payer: null, category: null, customer_name: "Aom", note: "Skincare set, bank transfer", status_after_payout: "received_in_bank" },
  { ref: "ex1", type: "expense", date: "2026-09-02", platform: "other", product_line: "sugar", gross_amount: 240, net_amount: 240, received_by: null, payer: "mike", category: "packaging", customer_name: null, note: "Kraft pouches", status_after_payout: null },
  { ref: "ex2", type: "expense", date: "2026-09-05", platform: "fb", product_line: "skincare", gross_amount: 600, net_amount: 600, received_by: null, payer: "sai", category: "ads", customer_name: null, note: "Facebook ads September", status_after_payout: null },
];

export const SEED_PAYOUT = {
  date: "2026-09-10",
  platform: "tiktok" as Platform,
  amount_received: 783,
  received_by: "mike" as Person,
  note: "TikTok weekly payout",
  /** Refs the FIFO match should pick: 315 + 468 = 783 exactly. */
  matches: ["tt1", "tt2"],
};

export const SEED_TRANSFER = {
  date: "2026-09-08",
  from_person: "sai" as Person,
  to_person: "mike" as Person,
  amount: 200,
  note: "Sai tops up Mike for packaging",
};

/**
 * Hand calculation, after the payout is reconciled:
 *   received_in_bank income: tt1 315 (Mike) + tt2 468 (Mike) + fb1 1200 (Sai) = 1983
 *   expenses: ex1 240 (Mike) + ex2 600 (Sai) = 840
 *   net profit = 1983 - 840 = 1143, target per person = 571.50
 *   Mike holds = 315 + 468 - 240 + 200 (transfer in) = 743
 *   Sai holds  = 1200 - 600 - 200 (transfer out) = 400
 *   Mike delta = 743 - 571.50 = +171.50  ->  "Mike owes Sai ฿171.50"
 *   pending: Shopee 801 (settled, not withdrawn)
 */
export const EXPECTED_AFTER_PAYOUT = {
  settledIncome: 1983,
  expenses: 840,
  netProfit: 1143,
  target: 571.5,
  holdings: { mike: 743, sai: 400 },
  owes: { from: "mike" as Person, to: "sai" as Person, amount: 171.5 },
  pendingTotal: 801,
};

/**
 * Before the payout is reconciled, tt1 and tt2 are still pending:
 *   received_in_bank income: fb1 1200 (Sai)
 *   net profit = 1200 - 840 = 360, target = 180
 *   Mike holds = -240 + 200 = -40, Sai holds = 1200 - 600 - 200 = 400
 *   Sai delta = 400 - 180 = +220  ->  "Sai owes Mike ฿220.00"
 *   pending: TikTok 783 + Shopee 801 = 1584
 */
export const EXPECTED_BEFORE_PAYOUT = {
  settledIncome: 1200,
  expenses: 840,
  netProfit: 360,
  target: 180,
  holdings: { mike: -40, sai: 400 },
  owes: { from: "sai" as Person, to: "mike" as Person, amount: 220 },
  pendingTotal: 1584,
};
