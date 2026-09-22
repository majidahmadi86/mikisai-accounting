/**
 * v3.4 on the live ledger: still to come is one number (My Balance halves it,
 * This week and Insights show it whole), exposure is owed to me plus still
 * coming, the buy buffer is per product on Products, and Insights shows no
 * figure the ledger does not.
 */
import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { login } from "./qa/helpers";

const OUT = "qa-output/screens";
const baht = (s: string) => Number((s.match(/฿([\d,]+\.\d{2})/)?.[1] ?? "NaN").replace(/,/g, ""));

async function stillComingWhole(page: Page): Promise<number> {
  await page.goto("/week?from=2026-09-15");
  const row = page.locator("main div.flex.items-baseline", { has: page.getByText("Still to come", { exact: true }) }).first();
  return baht(await row.innerText());
}

test("My Balance: still coming is half of This week's still to come; exposure = owed to me + still coming; screenshots", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page, "admin");
  const whole = await stillComingWhole(page);
  await page.goto("/balance");
  const main = page.locator("main");
  const text = await main.innerText();
  const coming = baht(text.slice(text.indexOf("Still coming")));
  const exposure = baht(text.slice(text.indexOf("MY MONEY IN SAI'S HANDS", text.indexOf("OWED TO ME NOW"))));
  const owed = baht(text.slice(text.indexOf("OWED TO ME NOW")));
  console.log(`MY BALANCE (Mike): still coming half mine ${coming}; This week still to come ${whole}; owed to me ${owed}; exposure ${exposure}`);
  expect(coming).toBeCloseTo(whole / 2, 1);
  expect(exposure).toBeCloseTo(Math.max(0, owed) + coming, 1);
  await page.screenshot({ path: `${OUT}/v34-balance-375.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.screenshot({ path: `${OUT}/v34-balance-1280.png`, fullPage: true });

  // Insights waits on the same whole figure.
  await page.goto("/insights");
  await expect(page.locator("main")).toContainText(`฿${whole.toLocaleString("en-US", { minimumFractionDigits: 2 })} still to arrive`);
});

test("Products: the admin edits the buy buffer inline; the contributor sees it read only", async ({ page, browser }) => {
  await login(page, "admin");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/products");
  await expect(page.getByRole("columnheader", { name: "Buy buffer" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /Weekly buy buffer for/ }).first()).toBeVisible();
  const other = await browser.newPage();
  await login(other, "contributor");
  await other.setViewportSize({ width: 1280, height: 900 });
  await other.goto("/products");
  await expect(other.getByRole("spinbutton", { name: /Weekly buy buffer for/ })).toHaveCount(0);
  await other.close();
});
