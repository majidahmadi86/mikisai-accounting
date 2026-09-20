/**
 * Every sale carries the platform's order ID, because that is what stops a
 * later import from adding the same order twice. A sale that truly has none
 * (a cash sale, a friend) says so with a reason; the reason is kept at the
 * end of the note, and Data health lists the row as "Will not dedupe against
 * imports".
 */
export const NO_ORDER_REF_MARK = "No order ID: ";
export const NO_ORDER_REF_MIN = 3;

const SEP = " · ";

/** Splits a stored note into the person's own text and the no-order-ID reason, if one was recorded. */
export function splitNoOrderRef(note: string | null | undefined): { note: string; reason: string | null } {
  const text = note ?? "";
  const at = text.lastIndexOf(NO_ORDER_REF_MARK);
  if (at < 0) return { note: text, reason: null };
  const before = text.slice(0, at);
  return { note: before.endsWith(SEP) ? before.slice(0, -SEP.length) : before.trimEnd(), reason: text.slice(at + NO_ORDER_REF_MARK.length).trim() };
}

/** The note to store: the person's text, then the reason when the sale has no order ID. Never doubles the marker on a second save. */
export function noteWithNoOrderRef(note: string | null | undefined, reason: string | null | undefined): string {
  const own = splitNoOrderRef(note).note.trim();
  const why = reason?.trim();
  return why ? [own, `${NO_ORDER_REF_MARK}${why}`].filter(Boolean).join(SEP) : own;
}

/** A sale is acceptable with an order ID, or with a reason for having none. */
export function orderRefProblem(orderRef: string | null | undefined, reason: string | null | undefined): "missing" | null {
  if (orderRef?.trim()) return null;
  return (reason?.trim().length ?? 0) >= NO_ORDER_REF_MIN ? null : "missing";
}
