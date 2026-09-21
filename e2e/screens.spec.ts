/**
 * Captures the 375px screenshots the v2.2 report asks for, signed in as the
 * admin: quick entry (income with product), Reports → Payments by category,
 * Reports → Stock on hand. Written to test-results/screens/. No data is changed.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const email = process.env.SEED_MIKE_EMAIL!;
const password = process.env.SEED_MIKE_PASSWORD!;
const OUT = "test-results/screens";

test("v2.2 screens at 375px", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|เข้าสู่ระบบ/i }).click();
  await page.waitForURL("**/");

  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Add", exact: true })).toBeVisible();
  await page.screenshot({ path: `${OUT}/quick-entry-income-375.png` });
  await page.keyboard.press("Escape");

  await page.goto("/reports");
  const category = page.getByRole("heading", { name: /Payments by category/ });
  await category.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/reports-expenses-by-category-375.png` });

  const stock = page.getByRole("heading", { name: /Stock on hand/ });
  await stock.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/reports-stock-on-hand-375.png` });
});
