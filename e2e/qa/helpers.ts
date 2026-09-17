/**
 * Shared plumbing for the QA sweep: sign-in as either founder, language
 * cookie, viewports, result recording (one JSON line per check, turned into
 * QA-REPORT.md by scripts/qa-report.ts), screenshots, and cleanup of every
 * probe row the flows create (tagged QA-PROBE, removed through the service role).
 */
import { config } from "dotenv";
import { appendFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, type BrowserContext, type Page } from "@playwright/test";

config({ path: ".env.local" });

export type Role = "admin" | "contributor";
export type Lang = "en" | "th";
export type Viewport = "phone" | "desktop";

export const VIEWPORTS: Record<Viewport, { width: number; height: number }> = { phone: { width: 375, height: 812 }, desktop: { width: 1440, height: 900 } };
export const CREDS: Record<Role, { email: string; password: string }> = {
  admin: { email: process.env.SEED_MIKE_EMAIL!, password: process.env.SEED_MIKE_PASSWORD! },
  contributor: { email: process.env.SEED_SAI_EMAIL!, password: process.env.SEED_SAI_PASSWORD! },
};
export const BUSINESS = "00000000-0000-4000-8000-000000000001";
export const BOX_ID = "00000000-0000-4000-8000-0000000000b1";
export const OUT = "qa-output";
export const PROBE = "QA-PROBE";

export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export type Result = { route: string; role: Role; viewport: Viewport; lang: Lang; check: string; pass: boolean; note?: string };

export function record(r: Result): void {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(`${OUT}/results.jsonl`, JSON.stringify(r) + "\n");
}

/** Runs a check, records pass or fail with the error message, and rethrows so the test fails too. */
export async function check(base: Omit<Result, "check" | "pass" | "note">, name: string, fn: () => Promise<void> | void, opts: { soft?: boolean } = {}): Promise<boolean> {
  try {
    await fn();
    record({ ...base, check: name, pass: true });
    return true;
  } catch (err) {
    record({ ...base, check: name, pass: false, note: String(err instanceof Error ? err.message.split("\n")[0] : err).slice(0, 200) });
    if (!opts.soft) throw err;
    return false;
  }
}

export async function setLang(context: BrowserContext, lang: Lang): Promise<void> {
  await context.addCookies([{ name: "locale", value: lang, domain: "localhost", path: "/" }]);
}

export async function login(page: Page, role: Role): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.goto("/login");
  await page.locator("#email").fill(CREDS[role].email);
  await page.locator("#password").fill(CREDS[role].password);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export function shotName(route: string, role: Role, viewport: Viewport, lang: Lang): string {
  const safe = route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home";
  return `${OUT}/shots/${safe}__${role}__${viewport}__${lang}.png`;
}

export async function shot(page: Page, route: string, role: Role, viewport: Viewport, lang: Lang, fullPage = false): Promise<string> {
  mkdirSync(`${OUT}/shots`, { recursive: true });
  const path = shotName(route, role, viewport, lang);
  await page.screenshot({ path, fullPage });
  return path;
}

/** Page-wide invariants every route must satisfy. */
export async function pageInvariants(page: Page, width: number): Promise<void> {
  const text = await page.locator("body").innerText();
  expect(text, "no em dash").not.toContain(String.fromCharCode(8212));
  expect(text, "no raw dictionary key").not.toMatch(/\b(?:reports|units|health|inventory|products|dashboard|transactions|common|nav|more|balance|insights|payouts|import|settings|audit|deleted|books|quick|tips|roles|transfer|customers|login)\.[a-zA-Z]+(?:\.[a-zA-Z_]+)?\b/);
  expect(text, "no unfilled placeholder").not.toMatch(/\{[a-z]+\}/);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, "page does not scroll sideways").toBeLessThanOrEqual(width + 1);
  await expect(page.locator("h1").first(), "has a heading").toBeVisible();
}

export function money(n: number): string {
  return `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Removes every probe row the sweep created, and their audit rows. */
export async function cleanupProbes(): Promise<void> {
  const { data: txs } = await admin.from("transactions").select("id").eq("business_id", BUSINESS).like("note", `${PROBE}%`);
  const txIds = (txs ?? []).map((t) => t.id as string);
  const { data: items } = txIds.length ? await admin.from("transaction_items").select("id").in("transaction_id", txIds) : { data: [] };
  const { data: moves } = txIds.length ? await admin.from("stock_movements").select("id").in("transaction_id", txIds) : { data: [] };
  const { data: products } = await admin.from("products").select("id").eq("business_id", BUSINESS).like("name", `${PROBE}%`);
  const productIds = (products ?? []).map((p) => p.id as string);
  if (productIds.length) await admin.from("stock_movements").delete().in("product_id", productIds);
  const { data: payouts } = await admin.from("payouts").select("id").eq("business_id", BUSINESS).like("note", `${PROBE}%`);
  const { data: transfers } = await admin.from("internal_transfers").select("id").eq("business_id", BUSINESS).like("note", `${PROBE}%`);
  const { data: customers } = await admin.from("customers").select("id").eq("business_id", BUSINESS).like("name", `${PROBE}%`);
  const ids = [...txIds, ...(items ?? []).map((i) => i.id as string), ...(moves ?? []).map((m) => m.id as string), ...productIds, ...(payouts ?? []).map((p) => p.id as string), ...(transfers ?? []).map((t) => t.id as string), ...(customers ?? []).map((c) => c.id as string)];
  if (txIds.length) await admin.from("transactions").delete().in("id", txIds);
  if (payouts?.length) await admin.from("payouts").delete().in("id", payouts.map((p) => p.id));
  if (transfers?.length) await admin.from("internal_transfers").delete().in("id", transfers.map((t) => t.id));
  if (customers?.length) await admin.from("customers").delete().in("id", customers.map((c) => c.id));
  if (productIds.length) await admin.from("products").delete().in("id", productIds);
  for (let i = 0; i < ids.length; i += 100) await admin.from("audit_log").delete().in("entity_id", ids.slice(i, i + 100));
  await admin.from("audit_log").delete().eq("business_id", BUSINESS).like("after->>note", `${PROBE}%`);
  await admin.from("audit_log").delete().eq("business_id", BUSINESS).like("before->>note", `${PROBE}%`);
}

/** Chooses a product in the full form's picker by a fragment of its variant or name. */
export async function pickProduct(page: Page, fragment: string): Promise<void> {
  const button = page.locator('form button[aria-haspopup="listbox"]').first();
  await button.click();
  await page.locator('[role="listbox"] [role="option"]', { hasText: fragment }).first().click();
}
