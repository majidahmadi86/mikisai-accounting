/**
 * v3.5 on the live ledger: the three real sugars are named in both languages
 * everywhere, the Mali bag is bought by the box of ten, and the samples are
 * one box of each. Screenshots of Products and Stock in EN and TH.
 */
import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { login, setLang } from "./qa/helpers";

const OUT = "qa-output/screens";
const EN = { rung: "Rung Nirand Amphawa · 100% pure coconut sugar · 10 kg box", mali: "Mali brand · 100% pure coconut sugar · 1 kg bag (box of 10 bags)", rock: "Red Rose brand (Rung Nirand) · premium selected rock sugar" };
const TH = { rung: "น้ำตาลมะพร้าวแท้ 100% รุ่งนิรันดร์ อัมพวา 10 กก.", mali: "น้ำตาลมะพร้าวแท้ 100% ตรามะลิ หอมหวานละมุนจากอัมพวา บรรจุ 1 กก. (1 กล่อง 10 ถุง)", rock: "น้ำตาลกรวดคัดพิเศษ ตรากุหลาบแดง (รุ่งนิรันดร์)" };

async function shots(page: Page, route: string, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto(route);
    await page.screenshot({ path: `${OUT}/v35-${name}-${width}.png`, fullPage: true });
  }
}

test("Products and Stock name the three sugars in English, and again in Thai", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page, "admin");
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of ["/products", "/stock"]) {
    await page.goto(route);
    const text = await page.locator("main").innerText();
    for (const name of Object.values(EN)) expect(text, `${route} names it in English`).toContain(name);
    for (const name of Object.values(TH)) expect(text, `${route} shows no Thai name while in English`).not.toContain(name);
  }
  await shots(page, "/products", "products-en");
  await shots(page, "/stock", "stock-en");

  await setLang(context, "th");
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of ["/products", "/stock"]) {
    await page.goto(route);
    const text = await page.locator("main").innerText();
    for (const name of Object.values(TH)) expect(text, `${route} names it in Thai`).toContain(name);
    for (const name of Object.values(EN)) expect(text, `${route} shows no English name while in Thai`).not.toContain(name);
  }
  await shots(page, "/products", "products-th");
  await shots(page, "/stock", "stock-th");
  await setLang(context, "en");
});

test("the Mali bag is bought by the box of ten, and the samples are one box of each", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/stock");
  const main = page.locator("main");
  // The bag shows both units, and the samples given are one box of each of the three.
  await expect(main).toContainText(/\d+(\.\d+)? box = \d+ bag/);
  await page.goto("/reports");
  await expect(page.locator("main")).toContainText("฿890.00");

  // Data health asks for the new product's pack size and price, and flags the cost taken from samples.
  await page.goto("/more/health");
  const health = page.locator("main");
  await expect(health).toContainText("Product needs pack size and price");
  await expect(health).toContainText("Cost taken from the samples");
  await expect(health).toContainText(EN.rock);
});
