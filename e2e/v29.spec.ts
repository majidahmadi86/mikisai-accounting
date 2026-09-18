/**
 * v2.9 screens at 375px: the Connect TikTok page with its sync log, the
 * synced orders waiting on Import, and the Home status line. Needs the local
 * mock run first (scripts/tiktok-sync-local.ts --run); skipped when no sync
 * has been logged, so the regular suite never depends on it.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const OUT = "qa-output/screens";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test("Connect TikTok page, sync log, review queue and the Home line", async ({ page }) => {
  const { count } = await admin.from("sync_log").select("id", { count: "exact", head: true });
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.goto("/login");
  await page.locator("#email").fill(process.env.SEED_MIKE_EMAIL!);
  await page.locator("#password").fill(process.env.SEED_MIKE_PASSWORD!);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL("**/");

  await page.goto("/more/connect-tiktok");
  await expect(page.getByRole("heading", { name: "Connect TikTok Shop" })).toBeVisible();
  await expect(page.getByText("One-time setup")).toBeVisible();
  await expect(page.getByText("https://mikisai.mikaro.studio/api/tiktok/callback")).toBeVisible();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sideways).toBeLessThanOrEqual(375);
  await page.screenshot({ path: `${OUT}/${count ? "connect-tiktok-connected-375.png" : "connect-tiktok-setup-375.png"}`, fullPage: true });
  test.skip(!count, "no sync logged: run scripts/tiktok-sync-local.ts --run for the connected screens");

  await expect(page.getByText("TikTok connected").first()).toBeVisible();
  await expect(page.getByText(/1 new · 0 cancelled · 0 refunded · 1 payout\(s\) · 2 to review/)).toBeVisible();
  await page.getByText("Sync log").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/sync-log-375.png` });

  await page.goto("/import");
  await expect(page.getByText("2 synced order(s) wait for you")).toBeVisible();
  await expect(page.getByText("no settlement yet, net estimated")).toBeVisible();
  await page.screenshot({ path: `${OUT}/sync-queue-import-375.png` });

  await page.goto("/");
  await expect(page.getByText(/TikTok connected · last sync .* · 2 to review/)).toBeVisible({ timeout: 70_000 });
  await page.screenshot({ path: `${OUT}/home-tiktok-line-375.png` });
});
