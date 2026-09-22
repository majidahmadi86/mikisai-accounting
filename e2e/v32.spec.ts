/**
 * v3.2 on the live ledger: This week for 15 to 21 September shows what the
 * Orders file says once the ledger is clean, and the one cash figure is the
 * same on Home, My Balance and This week for both founders.
 */
import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { login } from "./qa/helpers";

const OUT = "qa-output/screens";

async function owesOnThreePages(page: Page) {
  await page.goto("/");
  const banner = (await page.locator("h1").first().innerText()).trim();
  const amount = banner.match(/฿[\d,]+\.\d{2}/)?.[0] ?? null;
  await page.goto("/balance");
  const balance = (await page.locator("main").innerText()).trim();
  await page.goto("/week");
  const week = (await page.getByTestId("week-owes").innerText()).trim();
  return { banner, amount, balance, week };
}

for (const role of ["admin", "contributor"] as const) {
  test(`one cash figure: Home = My Balance = This week (${role})`, async ({ page }) => {
    await login(page, role);
    const o = await owesOnThreePages(page);
    if (o.amount) {
      expect(o.balance, "My Balance shows the Home figure").toContain(o.amount);
      expect(o.week, "This week shows the Home figure").toContain(o.amount);
    } else {
      expect(o.week).toMatch(/even/i);
    }
  });
}

test("This week, 15 to 21 September: 44 orders, 38 + 14 boxes, 1 bag, 6 cancelled kept out; screenshots at 1280 and 375", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page, "admin");
  await page.goto("/week?from=2026-09-15");
  const main = page.locator("main");
  await expect(main).toContainText("15 Sept 2026 to 21 Sept 2026");
  const row = (label: string | RegExp) => main.locator("div.flex.items-baseline", { has: page.getByText(label, { exact: typeof label === "string" }) }).first();
  await expect(row("Orders")).toContainText("44");
  await expect(row("1 kg packs")).toContainText("38");
  await expect(row("500 g packs")).toContainText("14");
  await expect(row("1 kg bag")).toContainText("1");
  await expect(row("Cancelled before shipping (not counted)")).toContainText("6");
  await page.screenshot({ path: `${OUT}/week-2026-09-15-375.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.screenshot({ path: `${OUT}/week-2026-09-15-1280.png`, fullPage: true });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(1280);

  // The cleanup has run: nothing left to clean for that week, and Data health counts the cancellations apart.
  await page.goto("/more/cleanup?from=2026-09-15");
  await expect(page.getByRole("button", { name: "Nothing to clean" })).toBeVisible();
  await page.goto("/more/health");
  await expect(page.getByTestId("health-cancelled-before")).not.toHaveText("0");
});
