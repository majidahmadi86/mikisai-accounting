import { round2 } from "@/lib/money";

export type Allocation = { settlement_id: string; paid: number; full: boolean };

/**
 * Spreads a payout over the selected orders oldest first. Orders it covers in
 * full become received in bank; the first it cannot cover in full gets the
 * remainder recorded and stays pending for the rest (TikTok pays 70% early,
 * the last 30% later). Anything beyond the payout stays untouched.
 */
export function allocatePayout(selected: { settlement_id: string; net_amount: number }[], amountReceived: number, tolerance = 0.02): Allocation[] {
  const total = round2(selected.reduce((a, s) => a + s.net_amount, 0));
  // Within tolerance of the total (fees rounding), everything is paid in full.
  if (Math.abs(total - amountReceived) <= amountReceived * tolerance) return selected.map((s) => ({ settlement_id: s.settlement_id, paid: s.net_amount, full: true }));
  let remaining = round2(amountReceived);
  const out: Allocation[] = [];
  for (const s of selected) {
    if (remaining <= 0) {
      out.push({ settlement_id: s.settlement_id, paid: 0, full: false });
      continue;
    }
    if (remaining >= s.net_amount) {
      out.push({ settlement_id: s.settlement_id, paid: s.net_amount, full: true });
      remaining = round2(remaining - s.net_amount);
    } else {
      out.push({ settlement_id: s.settlement_id, paid: remaining, full: false });
      remaining = 0;
    }
  }
  return out;
}

export const PAYOUT_REMINDER_HOUR = 18;

/**
 * Whether Home should nudge for today's payout: money is still with the
 * platforms, it is 18:00 or later in Bangkok, and no payout is dated today.
 */
export function payoutReminderDue(now: Date, pendingTotal: number, payoutDates: string[]): boolean {
  if (pendingTotal <= 0) return false;
  const bangkok = new Date(now.getTime() + 7 * 3600 * 1000);
  const today = bangkok.toISOString().slice(0, 10);
  if (bangkok.getUTCHours() < PAYOUT_REMINDER_HOUR) return false;
  return !payoutDates.includes(today);
}
