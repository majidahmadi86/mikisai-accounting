/**
 * v3.3 on the live ledger: the week-1 purchases are split (nothing owed on
 * either variant), the advance shows on the partner cards as money received
 * ahead of settlement, and This week states one net transfer with each side
 * underneath. Mark as sent is never clicked here: it would record a real transfer.
 */
import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { login } from "./qa/helpers";

const OUT = "qa-output/screens";

test("week 1: nothing owed on 1 kg or 500 g, one net transfer with both sides; screenshots at 375 and 1280", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page, "admin");
  await page.goto("/week?from=2026-09-15");
  const main = page.locator("main");
  await expect(main).toContainText("1 kg packs: owed 0 + buffer 5");
  await expect(main).toContainText("500 g packs: owed 0 + buffer 5");
  await expect(main).toContainText("This already nets what each of you paid and received. Only one transfer is needed.");
  const owes = (await page.getByTestId("week-owes").innerText()).trim();
  expect(owes).toMatch(/^(Sai sends Mike|Mike sends Sai) ฿[\d,]+\.\d{2}$|even/);
  await expect(page.getByTestId("week-side-sai")).toContainText("Sai's side: paid");
  await expect(page.getByTestId("week-side-sai")).toContainText("advanced by TikTok ahead of settlement");
  await expect(page.getByTestId("week-side-mike")).toContainText("Mike's side: paid");
  console.log("WEEK 1:", owes, "|", await page.getByTestId("week-side-sai").innerText(), "|", await page.getByTestId("week-side-mike").innerText());
  await page.screenshot({ path: `${OUT}/v33-week-2026-09-15-375.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.screenshot({ path: `${OUT}/v33-week-2026-09-15-1280.png`, fullPage: true });

  // Stock agrees: bought = sold on both variants.
  await page.goto("/stock");
  await expect(page.getByTestId("variant-split")).toHaveCount(0);
});

test("partner cards: received from TikTok, of which advanced; Home = My Balance = This week", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/");
  await expect(page.getByTestId("advanced-sai")).toContainText("advanced by TikTok ahead of settlement");
  const banner = (await page.locator("h1").first().innerText()).trim();
  console.log("HOME:", banner, "|", await page.getByTestId("advanced-sai").innerText());
  await page.locator("section").first().screenshot({ path: `${OUT}/v33-partner-cards-375.png` });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.locator("section").first().screenshot({ path: `${OUT}/v33-partner-cards-1280.png` });
  const amount = banner.match(/฿[\d,]+\.\d{2}/)?.[0] ?? null;
  await page.goto("/week");
  const week = (await page.getByTestId("week-owes").innerText()).trim();
  await page.goto("/balance");
  const balance = (await page.locator("main").innerText()).trim();
  if (amount) {
    expect(week).toContain(amount);
    expect(balance).toContain(amount);
  }
});
