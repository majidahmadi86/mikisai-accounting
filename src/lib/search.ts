import type { Product } from "@/lib/inventory/valuation";

/**
 * Global search, grouped for the overlay. A ledger row lands in the first
 * group it matches (order ID, then customer, amount, note), so it shows once.
 */
export const SEARCH_GROUPS = ["order", "customer", "amount", "note", "product"] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export type SearchRow = { id: string; date: string; type: "income" | "expense"; order_ref: string | null; customer_name: string | null; note: string | null; net_amount: number; gross_amount: number };
export type SearchHit = { group: SearchGroup; id: string; href: string; title: string; date: string | null; detail: string; amount: number | null };

const PER_GROUP = 6;

/** "1 kg packs · 10 kg box": the short name and the variant without its bracketed pack detail. Never the full product name when a short name exists. */
export function productLine(p: Pick<Product, "name" | "name_th" | "variant" | "short_name">, locale: "en" | "th" = "en"): string {
  const variant = p.variant.replace(/\s*\(.*\)\s*$/, "").trim();
  const lead = p.short_name || (locale === "th" && p.name_th ? p.name_th : p.name);
  return variant && variant !== lead ? `${lead} · ${variant}` : lead;
}

/** The number a person means when they type "377", "฿1,250" or "1250.50"; null when the text is not an amount. */
export function amountOf(q: string): number | null {
  const cleaned = q.replace(/[,฿\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
}

export function groupSearch(q: string, rows: SearchRow[], products: Pick<Product, "id" | "name" | "name_th" | "variant" | "short_name">[], locale: "en" | "th" = "en"): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const amount = amountOf(q);
  const has = (v: string | null) => (v ?? "").toLowerCase().includes(needle);
  const hits: SearchHit[] = [];
  const count = new Map<SearchGroup, number>();
  const push = (h: SearchHit) => {
    const n = count.get(h.group) ?? 0;
    if (n >= PER_GROUP) return;
    count.set(h.group, n + 1);
    hits.push(h);
  };

  for (const r of rows) {
    const href = `/transactions/${r.id}/edit`;
    const base = { id: r.id, href, date: r.date, amount: r.type === "expense" ? -r.net_amount : r.net_amount };
    if (has(r.order_ref)) push({ ...base, group: "order", title: `#${r.order_ref}`, detail: r.customer_name ?? "" });
    else if (has(r.customer_name)) push({ ...base, group: "customer", title: r.customer_name ?? "", detail: r.order_ref ? `#${r.order_ref}` : "" });
    else if (amount !== null && (r.net_amount === amount || r.gross_amount === amount)) push({ ...base, group: "amount", title: r.customer_name || (r.order_ref ? `#${r.order_ref}` : ""), detail: r.note ?? "" });
    else if (has(r.note)) push({ ...base, group: "note", title: r.note ?? "", detail: r.customer_name ?? "" });
  }
  for (const p of products) {
    if (![p.name, p.name_th, p.variant, p.short_name].some(has)) continue;
    push({ group: "product", id: p.id, href: `/products/${p.id}`, title: productLine(p, locale), date: null, detail: locale === "th" && p.name_th ? p.name_th : p.name, amount: null });
  }
  return SEARCH_GROUPS.flatMap((g) => hits.filter((h) => h.group === g));
}
