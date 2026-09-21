/**
 * v2.4 screens at 375px, signed in as the admin: Reports (every card, full
 * page), Units report, Home with the Yesterday card, Data health. Written to
 * test-results/screens/. Opening Data health records a run; nothing else changes.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const email = process.env.SEED_MIKE_EMAIL!;
const password = process.env.SEED_MIKE_PASSWORD!;
const OUT = "test-results/screens";

test("v2.4 reports, units, home yesterday and data health at 375px", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|เข้าสู่ระบบ/i }).click();
  await page.waitForURL("**/");

  // Yesterday lives on Reports, Units since v3.0.
  await page.goto("/reports/units");
  await expect(page.getByRole("heading", { name: "Yesterday" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/units-yesterday-375.png` });

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Profit and loss" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cash flow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Balance sheet" })).toBeVisible();
  await expect(page.getByText("The books balance.")).toBeVisible();
  // No number may wrap inside a cell: every money cell renders on one line.
  const wrapped = await page.locator("dd.tabular").evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height > 28).length);
  expect(wrapped).toBe(0);
  await page.screenshot({ path: `${OUT}/reports-all-cards-375.png`, fullPage: true });

  await page.goto("/reports/units");
  await expect(page.getByRole("heading", { name: "Units", level: 1 })).toBeVisible();
  await page.screenshot({ path: `${OUT}/units-report-375.png`, fullPage: true });

  await page.goto("/more/health");
  await expect(page.getByRole("heading", { name: "Data health" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/data-health-375.png`, fullPage: true });
});
