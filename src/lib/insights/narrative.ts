import "server-only";
import { unstable_cache } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import type { Locale } from "@/lib/i18n/dictionary";
import { geminiModel } from "@/lib/parse/gemini";
import { cleanNarrative } from "./clean";
import { buildInsights, type Insights } from "./compute";
import { valueStock } from "@/lib/inventory/valuation";
import { buildInventoryReports, productLabel } from "@/lib/inventory/reports";
import { thisMonth } from "@/lib/reports/period";
import type { LedgerSnapshot } from "@/lib/data/ledger";

export function insightsTag(businessId: string): string {
  return `insights:${businessId}`;
}

/** The numbers the paragraph is written from. The cache key is built from them, so new numbers mean a new paragraph. */
export type NarrativeProduct = { name: string; units: number; margin: number };

export function narrativeFacts(insights: Insights, named: NarrativeProduct[] = []) {
  return {
    as_of: insights.asOf,
    by_product: named.map((p) => ({ product: p.name, units_this_month: p.units, margin_this_month: p.margin })),
    products: insights.products.map((p) => ({
      product: p.product,
      units_30d: p.units30,
      profit_30d: p.profit30,
      margin_per_unit: p.marginPerUnit30,
      trend: p.trend,
      tag: p.tag,
      drift_drop_pct: p.drift?.dropPct ?? null,
      best_platform: p.bestPlatform?.platform ?? null,
    })),
    cash_waiting_total: insights.cashTotal,
    cash: insights.cash.map((c) => ({
      platform: c.platform,
      waiting: c.pending,
      next_7_days: c.next7,
      overdue: c.overdue,
      usual_lag_days: c.lagDays,
    })),
    exceptions: insights.exceptions.length,
  };
}

/**
 * Every baht amount in the paragraph must be one of the facts (rounded to the
 * baht): a paragraph that quotes any other figure is hidden, never shown.
 */
export function narrativeMatchesFacts(
  text: string,
  facts: ReturnType<typeof narrativeFacts>,
): boolean {
  const known = new Set<number>();
  const add = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v))
      known.add(Math.round(Math.abs(v)));
  };
  add(facts.cash_waiting_total);
  for (const p of facts.products)
    [p.profit_30d, p.margin_per_unit].forEach(add);
  for (const c of facts.cash)
    [c.waiting, c.next_7_days, c.overdue].forEach(add);
  for (const p of facts.by_product) add(p.margin_this_month);
  const quoted = Array.from(text.matchAll(/฿\s?([\d,]+(?:\.\d+)?)/g)).map((m) =>
    Math.round(Number(m[1].replace(/,/g, ""))),
  );
  return quoted.every(
    (q) => known.has(q) || known.has(q - 1) || known.has(q + 1),
  );
}

/**
 * Optional weekly paragraph from Gemini's free tier, cached per business,
 * locale and the exact numbers it is written from: when an import or any
 * change moves a number, the next page view writes a new one. Any failure (no
 * key, quota, network) or a paragraph quoting a figure that is not in the
 * facts returns null and the page omits the card; nothing else depends on it.
 */
export async function getWeeklyNarrative(
  businessId: string,
  insights: Insights,
  locale: Locale,
  named: NarrativeProduct[] = [],
): Promise<string | null> {
  if (!process.env.MIKISAI_GEMINI_KEY) return null;
  const facts = narrativeFacts(insights, named);
  const text = await unstable_cache(
    async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.MIKISAI_GEMINI_KEY! });
      const language =
        locale === "th" ? "Thai, polite and simple" : "plain English";
      const response = await ai.models.generateContent({
        model: geminiModel(),
        contents: [
          {
            role: "user",
            parts: [{ text: `Facts (JSON):\n${JSON.stringify(facts)}` }],
          },
        ],
        config: {
          systemInstruction: `You write a short weekly summary for two founders of a small online shop. Use only the facts given. Write one paragraph of three to five sentences in ${language}. Name products exactly as by_product spells them, never translated or invented. Mention the best product, any margin drift, how much cash is still to arrive and anything needing attention. Amounts are Thai baht: write them like ฿1,234. Never use an em dash. No headings, no bullet points, no emoji.`,
          temperature: 0.4,
          // Thinking models spend output tokens on reasoning first; give room and turn thinking off.
          maxOutputTokens: 1500,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const text = cleanNarrative(response.text);
      // Only a usable paragraph is cached; a failure is thrown so the next view tries again.
      if (!text) throw new Error("empty paragraph");
      return text;
    },
    ["insights-narrative", businessId, locale, JSON.stringify(facts)],
    { tags: [insightsTag(businessId)], revalidate: 86_400 },
  )().catch((err: unknown) => {
    console.error("[insights] narrative unavailable", err);
    return null;
  });
  return text && narrativeMatchesFacts(text, facts) ? text : null;
}

/**
 * Brings Insights up to date in the background (after an import, or when This
 * week opens): the numbers come from the current ledger snapshot, and the
 * paragraph for those numbers is written once, in both languages.
 */
export async function warmInsights(
  businessId: string,
  snapshot: LedgerSnapshot,
  today: string,
): Promise<void> {
  const insights = buildInsights(
    snapshot,
    today,
    valueStock(snapshot.products, snapshot.movements).cogsByTransaction,
  );
  if (!insights.products.length) return;
  await Promise.all(
    (["en", "th"] as const).map((l) =>
      getWeeklyNarrative(businessId, insights, l, namedProducts(snapshot, today, l)),
    ),
  );
}

/** This month's products by their real names, in one language: what the paragraph is allowed to name. */
export function namedProducts(snapshot: LedgerSnapshot, today: string, locale: Locale): NarrativeProduct[] {
  const sales = snapshot.transactions.filter((t) => t.type === "income").map((t) => ({ id: t.id, date: t.date, net_amount: t.net_amount }));
  return buildInventoryReports({ products: snapshot.products, movements: snapshot.movements, items: snapshot.items, sales }, thisMonth(today)).profitability.map((r) => ({ name: productLabel(r.product, locale), units: r.qty, margin: r.grossMargin }));
}
