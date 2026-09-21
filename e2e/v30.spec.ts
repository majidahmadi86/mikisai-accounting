/**
 * v3.0 screens: the header at 1024 and 1440px (one line, no sideways scroll),
 * the More menu between 768 and 1024, the search overlay (icon, Ctrl K,
 * grouped results, arrows, Enter, Esc), and Products and Ledger at 1280px
 * with no horizontal scroll. Read-only: nothing is written to the ledger.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { login, widthInvariants } from "./qa/helpers";

config({ path: ".env.local" });

const OUT = "qa-output/screens";
const BUSINESS = "00000000-0000-4000-8000-000000000001";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

for (const width of [1024, 1440]) {
  test(`header at ${width}px: every nav item on one line, no input, no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page, "admin");
    const nav = page.locator("header nav");
    for (const name of ["Home", "Ledger", "Products", "Stock", "My Balance", "Reports", "Insights", "More"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(page.locator("header input")).toHaveCount(0);
    const tops = await nav.locator("a").evaluateAll((els) => Array.from(new Set(els.filter((e) => (e as HTMLElement).offsetWidth > 0).map((e) => Math.round(e.getBoundingClientRect().top)))));
    expect(tops, "nav links share one line").toHaveLength(1);
    await widthInvariants(page, width);
    await page.screenshot({ path: `${OUT}/v30-header-${width}.png`, clip: { x: 0, y: 0, width, height: 120 } });
  });
}

test("between 768 and 1024 Insights and More fold into a More menu", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await login(page, "admin");
  const nav = page.locator("header nav");
  await expect(nav.getByRole("link", { name: "Insights", exact: true })).toBeHidden();
  await nav.getByRole("button", { name: "More pages" }).click();
  await expect(page.getByRole("menuitem", { name: "Insights" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "All pages" })).toBeVisible();
  await widthInvariants(page, 800);
  await page.screenshot({ path: `${OUT}/v30-header-more-menu-800.png`, clip: { x: 0, y: 0, width: 800, height: 260 } });
  await page.getByRole("menuitem", { name: "Insights" }).click();
  await expect(page).toHaveURL(/\/insights$/, { timeout: 30_000 });
});

test("search overlay: icon and Ctrl K open it, results are grouped, arrows and Enter open a row, Esc closes", async ({ page }) => {
  const { data } = await admin.from("transactions").select("id, order_ref").eq("business_id", BUSINESS).is("deleted_at", null).not("order_ref", "is", null).order("date", { ascending: false }).limit(1);
  const target = data?.[0];
  test.skip(!target, "no order with an order ID to search for");
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, "admin");

  await page.getByRole("button", { name: /^Search/ }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  const ref = String(target!.order_ref);
  await dialog.getByRole("combobox").fill(ref.slice(0, Math.max(6, ref.length - 2)));
  const group = dialog.getByRole("group", { name: "Order ID" });
  await expect(group.getByRole("option").first()).toContainText(ref.slice(0, 6));
  await expect(group.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await widthInvariants(page, 1280);
  await page.screenshot({ path: `${OUT}/v30-search-overlay-1280.png` });

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}\/edit$/);
  await expect(dialog).toBeHidden();
});

test("search overlay on a phone: a top-right icon, never a persistent input", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, "contributor");
  await expect(page.locator("header input")).toHaveCount(0);
  await page.getByRole("button", { name: /^Search/ }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await dialog.getByRole("combobox").fill("sugar");
  await expect(dialog.getByRole("group", { name: "Product" }).getByRole("option").first()).toBeVisible();
  await widthInvariants(page, 375);
  await page.screenshot({ path: `${OUT}/v30-search-overlay-375.png` });
});

for (const [name, path] of [["products", "/products"], ["ledger", "/transactions"]] as const) {
  for (const width of [1024, 1280, 1440]) test(`${name} at ${width}px: no horizontal scroll, headers line up with cells`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, "admin");
    await page.goto(path);
    const table = page.locator("main table").first();
    await expect(table).toBeVisible();
    await widthInvariants(page, width);
    const m = await table.evaluate((t) => {
      const wrap = t.parentElement!;
      const head = Array.from(t.querySelectorAll("thead th")).filter((c) => (c as HTMLElement).offsetWidth > 0).map((c) => Math.round(c.getBoundingClientRect().left));
      const body = Array.from(t.querySelector("tbody tr")!.children).filter((c) => (c as HTMLElement).offsetWidth > 0).map((c) => Math.round(c.getBoundingClientRect().left));
      return { scroll: [wrap.scrollWidth, wrap.clientWidth], head, body, layout: getComputedStyle(t).tableLayout };
    });
    expect(m.scroll[0], "table does not scroll sideways").toBe(m.scroll[1]);
    expect(m.layout).toBe("fixed");
    expect(m.head).toEqual(m.body);
    await page.screenshot({ path: `${OUT}/v30-${name}-${width}.png` });
  });
}

// Revised v3.0: one entry door, Home with three things, Import by role.
test("the Add sheet has exactly four choices and Sale asks for the order ID first", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, "admin");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("radiogroup", { name: "Add", exact: true }).getByRole("radio")).toHaveText(["Sale", "Expense", "Money moved", "Payout received"]);
  await expect(sheet.getByRole("radio", { name: "Sale" })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.locator("#qo-ref")).toBeVisible();
  await expect(sheet.getByText(/Import from screenshot/)).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/v30-add-sheet-sale-375.png` });
  await sheet.getByRole("radio", { name: "Expense" }).click();
  const first = await sheet.getByRole("radiogroup", { name: "What did you pay for?" }).getByRole("radio").allInnerTexts();
  expect(first.slice(0, 2).join(" | ")).toMatch(/Stock purchase.*\|.*Sample/i);
  await page.screenshot({ path: `${OUT}/v30-add-sheet-expense-375.png` });
  await sheet.getByRole("radio", { name: "Payout received" }).click();
  await expect(sheet.locator("#po-amount")).toBeVisible();
  await widthInvariants(page, 375);
});

for (const role of ["admin", "contributor"] as const) {
  test(`Home for the ${role}: banner, one routine card, Stock strip, nothing else`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, role);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.getByText(role === "admin" ? "Export, drop, confirm" : "Record what you paid for today")).toBeVisible();
    await expect(page.getByText(role === "admin" ? "Record what you paid for today" : "Export, drop, confirm")).toHaveCount(0);
    await expect(page.getByText(/^Last import|^Nothing imported yet/)).toBeVisible();
    for (const gone of ["Recent activity", "Internal transfers", "Quick order", "Add income", "Record payout"]) await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
    const cards = await page.locator("main > div > *").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetHeight > 0).length);
    expect(cards, "banner, routine card, stock strip").toBeLessThanOrEqual(3);
    await widthInvariants(page, 375);
    await page.screenshot({ path: `${OUT}/v30-home-${role}-375.png`, fullPage: true });
    if (role === "contributor") {
      await page.getByRole("button", { name: "Record a payment" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByRole("radio", { name: "Expense" })).toHaveAttribute("aria-checked", "true");
      await expect(sheet.getByRole("radiogroup", { name: "What did you pay for?" }).getByRole("radio").first()).toHaveAttribute("aria-checked", "true");
      await page.screenshot({ path: `${OUT}/v30-home-contributor-record-375.png` });
    }
  });

  test(`Import for the ${role}`, async ({ page }) => {
    await page.setViewportSize(role === "admin" ? { width: 1280, height: 900 } : { width: 375, height: 812 });
    await login(page, role);
    await page.goto("/import");
    await expect(page.locator("h1").first()).toHaveText("Import");
    if (role === "admin") {
      await expect(page.getByText("Drop the two Seller Center exports")).toBeVisible();
      const order = await page.evaluate(() => {
        const text = document.body.innerText;
        return [text.indexOf("Drop the two Seller Center exports"), text.indexOf("Screenshots or pasted text")];
      });
      expect(order[0]).toBeGreaterThan(-1);
      expect(order[1]).toBeGreaterThan(order[0]);
    } else {
      await expect(page.getByText("Drop the two Seller Center exports")).toHaveCount(0);
      await expect(page.getByText("Screenshots or pasted text")).toBeVisible();
    }
    await widthInvariants(page, role === "admin" ? 1280 : 375);
    await page.screenshot({ path: `${OUT}/v30-import-${role}.png`, fullPage: true });
  });
}
