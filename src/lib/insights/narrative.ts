import "server-only";
import { unstable_cache } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import type { Locale } from "@/lib/i18n/dictionary";
import { geminiModel } from "@/lib/parse/gemini";
import type { Insights } from "./compute";

export function insightsTag(businessId: string): string {
  return `insights:${businessId}`;
}

/**
 * Optional weekly paragraph from Gemini's free tier. Cached for a day per
 * business and locale. Any failure (no key, quota, network) returns null and
 * the page simply omits the card; nothing else depends on it.
 */
export async function getWeeklyNarrative(businessId: string, insights: Insights, locale: Locale): Promise<string | null> {
  if (!process.env.MIKISAI_GEMINI_KEY) return null;
  return unstable_cache(
    async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.MIKISAI_GEMINI_KEY! });
        const facts = {
          as_of: insights.asOf,
          products: insights.products.map((p) => ({ product: p.product, units_30d: p.units30, profit_30d: p.profit30, margin_per_unit: p.marginPerUnit30, trend: p.trend, tag: p.tag, drift_drop_pct: p.drift?.dropPct ?? null, best_platform: p.bestPlatform?.platform ?? null })),
          cash_waiting_total: insights.cashTotal,
          cash: insights.cash.map((c) => ({ platform: c.platform, waiting: c.pending, next_7_days: c.next7, overdue: c.overdue, usual_lag_days: c.lagDays })),
          exceptions: insights.exceptions.length,
        };
        const language = locale === "th" ? "Thai, polite and simple" : "plain English";
        const response = await ai.models.generateContent({
          model: geminiModel(),
          contents: [{ role: "user", parts: [{ text: `Facts (JSON):\n${JSON.stringify(facts)}` }] }],
          config: {
            systemInstruction: `You write a short weekly summary for two founders of a small online shop. Use only the facts given. Write one paragraph of three to five sentences in ${language}. Mention the best product, any margin drift, how much cash is still to arrive and anything needing attention. Amounts are Thai baht: write them like ฿1,234. Never use an em dash. No headings, no bullet points, no emoji.`,
            temperature: 0.4,
            maxOutputTokens: 400,
          },
        });
        const text = response.text?.trim();
        return text && text.length > 20 ? text.replace(/—/g, ",") : null;
      } catch (err) {
        console.error("[insights] narrative unavailable", err);
        return null;
      }
    },
    ["insights-narrative", businessId, locale, insights.asOf],
    { tags: [insightsTag(businessId)], revalidate: 86_400 },
  )();
}
