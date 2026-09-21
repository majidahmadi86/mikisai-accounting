/**
 * Regression: a transfer with a very long note must not widen My Balance (where the Money moved list lives since v3.0)
 * beyond the viewport or push the bottom tab bar. Signs in as the admin with
 * the seed credentials, plants one probe transfer with a 300 character note
 * through the service role, checks every width, and removes the probe
 * (and its audit rows) afterwards.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const email = process.env.SEED_MIKE_EMAIL!;
const password = process.env.SEED_MIKE_PASSWORD!;
const BUSINESS = "00000000-0000-4000-8000-000000000001";
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];
const LONG_NOTE = "ThisIsAVeryLongUnbrokenNoteThatUsedToWidenTheCard".repeat(6).slice(0, 300);

const admin = createClient(url, service, { auth: { persistSession: false } });
let probeId = "";

test.beforeAll(async () => {
  const { data, error } = await admin
    .from("internal_transfers")
    .insert({ business_id: BUSINESS, date: "2026-09-16", from_person: "sai", to_person: "mike", amount: 1, kind: "settlement", reason: "profit_share", note: LONG_NOTE })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("probe insert failed");
  probeId = data.id;
});

test.afterAll(async () => {
  if (!probeId) return;
  await admin.from("internal_transfers").delete().eq("id", probeId);
  await admin.from("audit_log").delete().eq("entity_id", probeId);
});

test("My Balance never scrolls sideways with a 300 character note", async ({ page }) => {
  // The probe bypasses the app, so the ledger snapshot cache (60 s safety net) may hide it briefly.
  test.setTimeout(180_000);
  // The first-run tour would cover the screenshot; mark it seen like a returning user.
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|เข้าสู่ระบบ/i }).click();
  await page.waitForURL("**/");
  const deadline = Date.now() + 75_000;
  while ((await page.getByText(LONG_NOTE.slice(0, 40), { exact: false }).count()) === 0 && Date.now() < deadline) {
    await page.waitForTimeout(5_000);
    await page.goto("/balance");
  }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/balance");
    await expect(page.getByText(LONG_NOTE.slice(0, 40), { exact: false }).first()).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `page wider than ${width}px viewport`).toBeLessThanOrEqual(width);
    if (width < 768) {
      const tab = page.getByRole("navigation", { name: "Primary" });
      const box = await tab.boundingBox();
      expect(box, "tab bar visible").not.toBeNull();
      expect(box!.x + box!.width, "tab bar inside viewport").toBeLessThanOrEqual(width + 1);
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/balance");
  await expect(page).toHaveScreenshot("balance-375-long-note.png", { fullPage: true, maxDiffPixelRatio: 0.05 });
});
