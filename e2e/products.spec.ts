/**
 * v2.3 screens at 375px, signed in as the admin: /products list, one product
 * detail, and the income edit form with whole-unit quantities and the
 * "Sale price per unit" label. Also checks that qty 1 and 10 pass the
 * browser's own validation. Written to test-results/screens/. No data is changed.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const email = process.env.SEED_MIKE_EMAIL!;
const password = process.env.SEED_MIKE_PASSWORD!;
const OUT = "test-results/screens";

test("v2.3 products and income edit at 375px", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|เข้าสู่ระบบ/i }).click();
  await page.waitForURL("**/");

  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/products-list-375.png` });

  await page.getByRole("link", { name: /1 kg packs/ }).first().click();
  await page.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Average vs standard")).toBeVisible();
  await page.screenshot({ path: `${OUT}/product-detail-375.png` });

  // First income row in the ledger, then its edit form.
  await page.goto("/transactions?type=income");
  await page.locator('a[href^="/transactions/"][href$="/edit"]').first().click();
  await page.waitForURL("**/transactions/**/edit");
  await expect(page.getByText("Sale price per unit").first()).toBeVisible();
  await expect(page.getByText(/Cost per unit: ฿[\d,.]+ \(average from stock purchases\)/).first()).toBeVisible();

  const qty = page.getByLabel("Qty", { exact: true }).first();
  await expect(qty).toHaveAttribute("step", "1");
  await expect(qty).toHaveAttribute("min", "1");
  await expect(qty).toHaveAttribute("inputmode", "numeric");
  for (const v of ["1", "10"]) {
    await qty.fill(v);
    expect(await qty.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(true);
  }
  await qty.fill("1");
  await page.getByText("Sale price per unit").first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/income-edit-375.png` });
});
