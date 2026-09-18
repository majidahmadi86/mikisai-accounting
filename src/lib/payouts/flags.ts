import { round2 } from "@/lib/money";

export type PayoutSettlementRow = { payout_id: string | null; deleted_at: string | null; net_amount: number };

export type PayoutMatchSummary = { count: number; total: number; removed: number; unallocated: number };

/**
 * What each payout covers today. Live settlements count as matched; a
 * settlement soft-deleted with its sale still points at the payout, so the
 * payout shows "1 order removed, ฿X unallocated" and needs a re-confirm,
 * which clears the pointer.
 */
export function summarisePayoutMatches(rows: PayoutSettlementRow[]): Map<string, PayoutMatchSummary> {
  const out = new Map<string, PayoutMatchSummary>();
  for (const s of rows) {
    if (!s.payout_id) continue;
    const cur = out.get(s.payout_id) ?? { count: 0, total: 0, removed: 0, unallocated: 0 };
    if (s.deleted_at) {
      cur.removed += 1;
      cur.unallocated = round2(cur.unallocated + s.net_amount);
    } else {
      cur.count += 1;
      cur.total = round2(cur.total + s.net_amount);
    }
    out.set(s.payout_id, cur);
  }
  return out;
}
