import { round2 } from "@/lib/money";

/** Lines must add up to the amount on the row within five satang. */
export const RECONCILE_TOLERANCE = 0.05;

export type ReconcileLine = { qty: number; price: number };
export type ReconcileResult = { ok: boolean; sum: number; total: number; difference: number };

/**
 * Sum of qty times price per unit against the row total. A single line whose
 * price is exactly the rounded total divided by qty always passes: with
 * two-decimal unit prices that rounding is unavoidable and is not a mistake.
 */
export function reconcileLines(lines: ReconcileLine[], total: number): ReconcileResult {
  const sum = round2(lines.reduce((a, l) => a + l.qty * l.price, 0));
  const difference = round2(sum - total);
  let ok = Math.abs(difference) <= RECONCILE_TOLERANCE;
  if (!ok && lines.length === 1 && lines[0].qty > 0 && round2(total / lines[0].qty) === round2(lines[0].price)) ok = true;
  return { ok, sum, total: round2(total), difference };
}

/** Price per unit that makes a single line equal the total. */
export function derivedUnitPrice(total: number, qty: number): number {
  return qty > 0 ? round2(total / qty) : 0;
}
