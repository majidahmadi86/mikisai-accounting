/**
 * 375px visual snapshots of Reports and Stock, signed in as the admin. The
 * first run writes the baseline; later runs fail when the layout drifts
 * (overlapping labels, a wrapped number, a card leaking another card's rows).
 * Live numbers change day to day, so the comparison allows a small diff ratio.
 */
import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

test.use({ viewport: { width: 375, height: 812 } });

test("reports and stock at 375px", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.goto("/login");
  await page.locator("#email").fill(process.env.SEED_MIKE_EMAIL!);
  await page.locator("#password").fill(process.env.SEED_MIKE_PASSWORD!);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL("**/");

  await page.goto("/reports?period=month");
  await expect(page.getByRole("heading", { name: "Balance sheet" })).toBeVisible();
  // Every stat tile value sits on one line and inside its tile.
  const overflow = await page.locator("p.tabular").evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(overflow, "no stat value overflows its tile").toBe(0);
  await expect(page).toHaveScreenshot("reports-375.png", { maxDiffPixelRatio: 0.08 });

  await page.goto("/stock");
  await expect(page.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  await expect(page).toHaveScreenshot("stock-375.png", { maxDiffPixelRatio: 0.08 });
});
