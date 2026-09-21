/**
 * Contributor flows: may add and edit own rows within 24 hours, may add a
 * product, sees read-only settings, and is turned away from admin pages with
 * the denied message. Probe rows are removed afterwards.
 */
import { expect, test } from "@playwright/test";
import { admin, BUSINESS, check, cleanupProbes, addSale, login, PROBE, probeOrderId, setLang, shot, VIEWPORTS } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ viewport: VIEWPORTS.phone });

const base = (route: string) => ({ route, role: "contributor" as const, viewport: "phone" as const, lang: "en" as const });

test.afterAll(async () => {
  await cleanupProbes();
});

test("contributor adds a sale, edits it, cannot delete, sees denied on admin pages", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "contributor");

  await check(base("Add · Sale"), "a sale saves for a contributor", async () => {
    await addSale(page, { ref: probeOrderId(), receive: 377, note: `${PROBE} contributor` });
    await page.goto("/transactions");
    await expect(page.getByText(`${PROBE} contributor`).first()).toBeVisible();
  });
  await shot(page, "/transactions-after-save", "contributor", "phone", "en");

  const { data: probe } = await admin.from("transactions").select("id").eq("business_id", BUSINESS).eq("note", `${PROBE} contributor`).single();
  const id = probe!.id as string;

  await check(base("/transactions/[id]/edit"), "own row within 24 hours can be edited; no Delete button", async () => {
    await page.goto(`/transactions/${id}/edit`);
    await expect(page.getByRole("button", { name: /^Delete$/ })).toHaveCount(0);
    await page.locator("#customer_name").fill(`${PROBE} customer`);
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
    const { data: row } = await admin.from("transactions").select("customer_name").eq("id", id).single();
    expect(row!.customer_name).toBe(`${PROBE} customer`);
  });

  await check(base("/products/new"), "contributor may add a product", async () => {
    await page.goto("/products/new");
    await page.locator("#p-name").fill(`${PROBE} contributor product`);
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await page.waitForURL(/\/products\/[0-9a-f-]{36}\?saved=1/);
  });

  await check(base("/products/[id]/edit"), "contributor cannot edit a product: denied", async () => {
    const pid = page.url().match(/products\/([0-9a-f-]{36})/)![1];
    await page.goto(`/products/${pid}/edit`);
    await expect(page).toHaveURL(/\/products\?denied=1/);
    await expect(page.getByText(/admin/i).first()).toBeVisible();
  });

  await check(base("/settings"), "settings are read-only for a contributor", async () => {
    await page.goto("/settings");
    await expect(page.locator("#exposure_limit")).toHaveAttribute("readonly", /.*/);
  });

  for (const path of ["/audit", "/more/deleted", "/more/check-books"]) {
    await check(base(path), "admin page turns the contributor away", async () => {
      await page.goto(path);
      await expect(page).toHaveURL(/denied=1/);
    });
  }

  await check(base("/more/health"), "data health is a read-only summary for a contributor", async () => {
    await page.goto("/more/health");
    await expect(page.getByText(/Read-only summary/)).toBeVisible();
    await expect(page.getByText(/Admin only/).first()).toBeVisible();
  });
  await shot(page, "/more/health", "contributor", "phone", "en");

  await check(base("/ (routine card)"), "Record what you paid for opens Expense on Stock purchase and saves", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Record a payment" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("radiogroup", { name: "What did you pay for?" }).getByRole("radio").first()).toHaveAttribute("aria-checked", "true");
    await sheet.getByRole("radio", { name: "Packaging", exact: true }).click();
    await sheet.locator("#qe-amount").fill("45");
    await sheet.getByRole("button", { name: /Add a note/ }).click();
    await sheet.locator("#qe-note").fill(`${PROBE} contributor quick`);
    await sheet.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByRole("button", { name: /^Undo$/ })).toBeVisible({ timeout: 15_000 });
  });
});
