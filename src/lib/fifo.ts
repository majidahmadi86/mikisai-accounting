import { round2 } from "./money";

export type MatchCandidate = {
  settlement_id: string;
  transaction_id: string;
  date: string;
  created_at: string;
  net_amount: number;
};

export type MatchProposal = {
  selectedIds: string[];
  total: number;
  difference: number;
  matched: boolean;
  tolerance: number;
};

export const PAYOUT_TOLERANCE = 0.02;

/**
 * FIFO payout match: walk the oldest unpaid orders first, adding net amounts
 * until the running total lands within ±tolerance of the payout. If no prefix
 * lands inside the window, return the prefix whose total is closest so the
 * user can adjust by hand.
 */
export function proposeFifoMatch(candidates: MatchCandidate[], amountReceived: number, tolerance = PAYOUT_TOLERANCE): MatchProposal {
  const sorted = [...candidates].sort((a, b) => (a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date)));
  const low = amountReceived * (1 - tolerance);
  const high = amountReceived * (1 + tolerance);

  let running = 0;
  let best = { count: 0, total: 0 };
  for (let i = 0; i < sorted.length; i += 1) {
    running = round2(running + sorted[i].net_amount);
    if (Math.abs(running - amountReceived) < Math.abs(best.total - amountReceived)) {
      best = { count: i + 1, total: running };
    }
    if (running >= low && running <= high) {
      return {
        selectedIds: sorted.slice(0, i + 1).map((c) => c.settlement_id),
        total: running,
        difference: round2(running - amountReceived),
        matched: true,
        tolerance,
      };
    }
    if (running > high) break;
  }

  return {
    selectedIds: sorted.slice(0, best.count).map((c) => c.settlement_id),
    total: best.total,
    difference: round2(best.total - amountReceived),
    matched: false,
    tolerance,
  };
}

export function isWithinTolerance(total: number, amountReceived: number, tolerance = PAYOUT_TOLERANCE): boolean {
  return Math.abs(total - amountReceived) <= amountReceived * tolerance;
}
