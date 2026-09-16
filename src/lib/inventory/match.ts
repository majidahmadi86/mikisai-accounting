import type { ProductLine } from "@/lib/types";

export type MatchableProduct = { id: string; name: string; variant: string; product_line: ProductLine };

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[฀-๿]+/g, (m) => m) // keep Thai as-is
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t.length > 1);
}

/**
 * Fuzzy match of a parsed receipt line to a product: token overlap on
 * name plus variant, with the variant label weighted. Returns null below a
 * confidence floor so the review table shows the picker instead of guessing.
 */
export function matchProduct<P extends MatchableProduct>(products: P[], name: string | null, variant: string | null, note: string | null, line: ProductLine): P | null {
  const text = `${name ?? ""} ${variant ?? ""} ${note ?? ""}`;
  const want = new Set(tokens(text));
  if (want.size === 0 && !name) return null;
  let best: { p: P; score: number } | null = null;
  for (const p of products) {
    const nameTokens = tokens(p.name);
    const variantTokens = tokens(p.variant);
    let score = 0;
    for (const t of nameTokens) if (want.has(t)) score += 2;
    for (const t of variantTokens) if (want.has(t)) score += 3;
    if (variant && p.variant && norm(variant) === norm(p.variant)) score += 4;
    if (name && norm(p.name) && norm(name).includes(norm(p.name))) score += 3;
    if (p.product_line === line) score += 1;
    if (!best || score > best.score) best = { p, score };
  }
  if (!best) return null;
  // Needs at least one real word in common beyond the product line hint.
  return best.score >= 3 ? best.p : null;
}
