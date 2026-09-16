/**
 * Ledger shaped like the seed data (after the TikTok payout is reconciled),
 * used by the report, export and insight tests. Hand totals are listed next
 * to each expectation in the tests.
 */
import type { ReportInput, ReportTx } from "@/lib/reports/build";
import { SEED_CATEGORIES, SEED_PAYOUT, SEED_TRANSACTIONS, SEED_TRANSFER } from "./seed-data";

export const REPORT_TODAY = "2026-09-16";
export const PAYOUT_ID = "payout-1";

export function seedLedger(): ReportInput {
  const transactions: ReportTx[] = SEED_TRANSACTIONS.map((t) => ({
    id: t.ref,
    type: t.type,
    date: t.date,
    platform: t.platform,
    product_line: t.product_line,
    gross_amount: t.gross_amount,
    net_amount: t.net_amount,
    quantity: t.ref === "tt2" ? 2 : 1,
    payer: t.payer,
    received_by: t.received_by,
    category_id: t.category_id,
    customer_name: t.customer_name,
    note: t.note,
    created_at: `${t.date}T09:00:00Z`,
    settlement:
      t.type === "income"
        ? {
            status: t.status_after_payout ?? "pending",
            settled_at: t.status_after_payout === "received_in_bank" ? (SEED_PAYOUT.matches.includes(t.ref) ? `${SEED_PAYOUT.date}T10:00:00Z` : `${t.date}T12:00:00Z`) : null,
            payout_id: SEED_PAYOUT.matches.includes(t.ref) ? PAYOUT_ID : null,
          }
        : null,
  }));
  return {
    transactions,
    transfers: [{ id: "tr1", ...SEED_TRANSFER }],
    categories: SEED_CATEGORIES,
    payouts: [{ id: PAYOUT_ID, date: SEED_PAYOUT.date, platform: SEED_PAYOUT.platform, amount_received: SEED_PAYOUT.amount_received, received_by: SEED_PAYOUT.received_by, note: SEED_PAYOUT.note }],
  };
}
