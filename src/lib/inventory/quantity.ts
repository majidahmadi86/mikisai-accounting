/**
 * Deterministic quantity and variant reading for imported orders. Runs after
 * the AI extraction so a listing such as "20 kg" or "2 กล่อง" becomes the
 * base 10 kg box times two, and "x2" or "จำนวน 2" in any text is a count.
 * Returns null when nothing says how many; the review table then blocks
 * saving until someone fills it in.
 */

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

export function arabicDigits(text: string): string {
  return text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

const COUNT_PATTERNS: RegExp[] = [
  /(?:^|[\s(,:])[x×]\s*(\d{1,4})(?!\d)/i,
  /(\d{1,4})\s*(?:pcs?|pieces?|units?|boxes|box|ชิ้น|กล่อง|แพ็ก|แพ็ค|ถุง|ขวด)(?![a-z])/i,
  /(?:จำนวน|qty|quantity)\s*[:.]?\s*(\d{1,4})/i,
];

/** A unit count found in free text, or null. */
export function quantityFromText(...texts: (string | null | undefined)[]): number | null {
  for (const raw of texts) {
    if (!raw) continue;
    const text = arabicDigits(raw);
    for (const re of COUNT_PATTERNS) {
      const m = re.exec(text);
      if (m) {
        const n = Number(m[1]);
        if (Number.isInteger(n) && n >= 1 && n <= 9999) return n;
      }
    }
  }
  return null;
}

export type VariantMap = { baseVariant: string | null; multiplier: number };

const BASE_KG = 10;

/**
 * Listing variants that are multiples of the base box: "20 kg" or "20 กก." is
 * two boxes, "30 kg" three, "2 กล่อง" or "2 boxes" two. Anything else keeps
 * a multiplier of one and its own label.
 */
export function mapVariant(variant: string | null | undefined): VariantMap {
  if (!variant) return { baseVariant: null, multiplier: 1 };
  const v = arabicDigits(variant).trim();
  const kg = /(\d+(?:\.\d+)?)\s*(?:kg|kgs|กก\.?|กิโล(?:กรัม)?)(?![a-z])/i.exec(v);
  if (kg) {
    const n = Number(kg[1]);
    if (n >= BASE_KG && n % BASE_KG === 0) return { baseVariant: `${BASE_KG} kg`, multiplier: n / BASE_KG };
    return { baseVariant: v, multiplier: 1 };
  }
  const boxes = /(\d{1,3})\s*(?:boxes|box|กล่อง)(?![a-z])/i.exec(v);
  if (boxes) {
    const n = Number(boxes[1]);
    if (n >= 1) return { baseVariant: `${BASE_KG} kg`, multiplier: n };
  }
  return { baseVariant: v, multiplier: 1 };
}

export type ResolvedQuantity = { quantity: number | null; variant: string | null; source: "explicit" | "variant" | "both" | "none" };

/**
 * Units for one imported order. An explicit count times the variant
 * multiplier when both are present; the variant alone when it names a
 * multiple of the base box; null when neither says anything.
 */
export function resolveQuantity(order: { quantity: number | null; variant: string | null; product_name: string | null; note: string | null }): ResolvedQuantity {
  const explicit = order.quantity && order.quantity >= 1 ? Math.round(order.quantity) : quantityFromText(order.note, order.product_name);
  const mapped = mapVariant(order.variant);
  if (explicit && mapped.multiplier > 1) return { quantity: explicit * mapped.multiplier, variant: mapped.baseVariant, source: "both" };
  if (explicit) return { quantity: explicit, variant: mapped.baseVariant ?? order.variant, source: "explicit" };
  if (mapped.multiplier > 1) return { quantity: mapped.multiplier, variant: mapped.baseVariant, source: "variant" };
  return { quantity: null, variant: order.variant, source: "none" };
}

/** Bounds for "you receive per unit" against the standard sale price before the amount looks wrong. */
export const SANITY_HIGH = 1.6;
export const SANITY_LOW = 0.6;

export type SanityWarning = { perUnit: number; looksLike: number; entered: number };

/**
 * Does the amount fit the quantity? Compares what you receive per unit with
 * the product's standard sale price. Outside 0.6x to 1.6x it suggests the
 * unit count the amount points to. A warning only, never a block.
 */
export function unitSanity(received: number, qty: number, standardPrice: number): SanityWarning | null {
  if (!(received > 0) || !(qty >= 1) || !(standardPrice > 0)) return null;
  const perUnit = received / qty;
  const ratio = perUnit / standardPrice;
  if (ratio <= SANITY_HIGH && ratio >= SANITY_LOW) return null;
  const looksLike = Math.max(1, Math.round(received / standardPrice));
  if (looksLike === qty) return null;
  return { perUnit: Math.round(perUnit * 100) / 100, looksLike, entered: qty };
}
