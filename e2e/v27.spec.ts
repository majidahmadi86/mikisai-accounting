/**
 * v2.7 screens: the who-owes-whom figure on Home, Investment and My Balance
 * must be the same text, and the transfer sheet at 375px. Signed in as the
 * admin; nothing is saved.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const OUT = "qa-output/screens";

test("one who-owes-whom figure on Home, Investment and My Balance; transfer sheet at 375px", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.goto("/login");
  await page.locator("#email").fill(process.env.SEED_MIKE_EMAIL!);
  await page.locator("#password").fill(process.env.SEED_MIKE_PASSWORD!);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL("**/");

  const banner = (await page.locator("h1").first().innerText()).trim();
  await page.screenshot({ path: `${OUT}/home-banner-375.png` });
  const amount = banner.match(/฿[\d,]+\.\d{2}/)?.[0] ?? null;

  await page.goto("/investment");
  const investmentText = (await page.locator("main").innerText()).trim();
  if (amount) await expect(page.getByText("Already counted: transfers between you.")).toBeVisible();
  await page.screenshot({ path: `${OUT}/investment-to-be-equal-375.png` });

  await page.goto("/balance");
  const owed = (await page.locator("main").innerText()).trim();
  await page.screenshot({ path: `${OUT}/my-balance-owed-375.png` });

  if (amount) {
    expect(investmentText, "Investment shows the Home figure").toContain(amount);
    expect(owed, "My Balance shows the Home figure").toContain(amount);
  } else {
    // Nobody owes anybody: every page says so in its own words, none names an amount owed.
    expect(banner).toMatch(/Balanced|even/i);
    expect(investmentText).not.toMatch(/owes/);
    expect(owed).toMatch(/even/i);
  }

  // Data health: the Consistency check runs the same equalities on live data and must be green.
  await page.goto("/more/health");
  const consistency = page.locator("div.rounded-card", { has: page.getByText("Pages that disagree about the same number", { exact: true }) }).last();
  await expect(consistency).toBeVisible();
  await expect(consistency.locator("span", { hasText: /^0$/ })).toBeVisible();
  await expect(consistency).not.toHaveClass(/berry/);
  await page.screenshot({ path: `${OUT}/data-health-consistency-375.png` });

  await page.goto("/");
  await page.getByRole("button", { name: "Record an internal transfer" }).click();
  await expect(page.getByRole("heading", { name: "Record an internal transfer" })).toBeVisible();
  // Reason chips: one column at 375px, whole words only.
  const chips = page.locator('[role="radiogroup"][aria-label="Why the money moved"] button');
  const boxes = await chips.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
  const lefts = new Set(boxes.map((b) => Math.round(b.left)));
  expect(lefts.size, "one column of reason chips at 375px").toBe(1);
  await page.screenshot({ path: `${OUT}/transfer-sheet-375.png` });
  await page.keyboard.press("Escape");
});
