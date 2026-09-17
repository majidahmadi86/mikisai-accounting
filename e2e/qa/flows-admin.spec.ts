/**
 * Admin flows: every main form is filled and saved (valid and invalid), and
 * the ledger and the relevant report are asserted to have moved. Probe rows
 * carry a QA-PROBE note and are removed afterwards through the service role.
 */
import { expect, test } from "@playwright/test";
import { admin, BOX_ID, BUSINESS, check, cleanupProbes, login, money, pickProduct, PROBE, setLang, shot, VIEWPORTS } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ viewport: VIEWPORTS.desktop });

const base = (route: string) => ({ route, role: "admin" as const, viewport: "desktop" as const, lang: "en" as const });

async function tileValue(page: import("@playwright/test").Page, label: RegExp): Promise<number> {
  const tile = page.locator("p.eyebrow", { hasText: label }).first().locator("xpath=..");
  const text = await tile.locator("p.tabular").first().innerText();
  return Number(text.replace(/[^\d.-]/g, ""));
}

test.beforeAll(async () => {
  await cleanupProbes();
});
test.afterAll(async () => {
  await cleanupProbes();
});

test("income: new form saves, ledger and reports move, invalid lines are blocked, edit keeps lines in step, delete and restore", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");

  await page.goto("/reports");
  const revenueBefore = await tileValue(page, /You received/i);

  await page.goto("/transactions/new?type=income");
  const b = base("/transactions/new");
  await check(b, "invalid: lines that do not add up are refused with the difference", async () => {
    await page.locator("#gross_amount").fill("798");
    await page.locator("#net_amount").fill("754");
    await page.getByLabel("Qty", { exact: true }).first().fill("2");
    await page.locator("#note").fill(`${PROBE} income`);
    // Tamper the hidden lines so qty x price is 399, not 798.
    await page.evaluate(() => {
      const el = document.querySelector('input[name="items"]') as HTMLInputElement;
      const rows = JSON.parse(el.value) as { qty: number; unit_price: number }[];
      rows[0].qty = 1;
      el.value = JSON.stringify(rows);
    });
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await expect(page).toHaveURL(/error=reconcile/);
    await expect(page.getByText(/do not add up/)).toBeVisible();
  });
  await shot(page, "/transactions/new-invalid", "admin", "desktop", "en");

  await check(b, "valid: qty 2 derives the unit price and saves", async () => {
    await page.locator("#gross_amount").fill("798");
    await page.locator("#net_amount").fill("754");
    await pickProduct(page, "1 kg x 10 packs");
    const qty = page.getByLabel("Qty", { exact: true }).first();
    await qty.fill("2");
    await expect(page.getByText(/Lines ฿798\.00 · row ฿798\.00/)).toBeVisible();
    await page.locator("#note").fill(`${PROBE} income`);
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/transactions\?saved=1/, { timeout: 15_000 });
  });

  await check(base("/transactions"), "ledger shows the row with product x qty", async () => {
    const row = page.locator("tr", { hasText: `${PROBE} income` }).first();
    await expect(row.getByText("1 kg packs × 2", { exact: true })).toBeVisible();
  });
  await shot(page, "/transactions-after-save", "admin", "desktop", "en");

  await check(base("/reports"), "reports revenue moved by the net amount", async () => {
    await page.goto("/reports");
    const after = await tileValue(page, /You received/i);
    expect(Math.round((after - revenueBefore) * 100) / 100).toBe(754);
  });

  const { data: probe } = await admin.from("transactions").select("id").eq("business_id", BUSINESS).eq("note", `${PROBE} income`).is("deleted_at", null).maybeSingle();
  expect(probe).not.toBeNull();
  const id = probe!.id as string;

  await check(base("/transactions/[id]/edit"), "edit: changing qty to 3 keeps gross and recomputes the unit price", async () => {
    await page.goto(`/transactions/${id}/edit`);
    await expect(page.locator("#gross_amount")).toHaveValue("798");
    const qty = page.getByLabel("Qty", { exact: true }).first();
    await qty.fill("3");
    await expect(page.getByText(/Lines ฿798\.00 · row ฿798\.00/)).toBeVisible();
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/transactions\?saved=1/, { timeout: 15_000 });
    await expect(page.locator("tr", { hasText: `${PROBE} income` }).first().getByText("1 kg packs × 3", { exact: true })).toBeVisible();
    const { data: items } = await admin.from("transaction_items").select("qty, unit_price").eq("transaction_id", id);
    expect(items).toEqual([{ qty: 3, unit_price: 266 }]);
  });
  await shot(page, "/transactions/[id]/edit-after", "admin", "desktop", "en");

  await check(base("/transactions/[id]/edit"), "delete: soft delete then restore from Recently deleted", async () => {
    await page.goto(`/transactions/${id}/edit`);
    await page.getByRole("button", { name: /^Delete$/ }).click();
    await expect(page.getByText(/Deleted|Undo/).first()).toBeVisible();
    await page.waitForURL(/\/transactions/);
    await page.goto("/more/deleted");
    await expect(page.getByText(`${PROBE} income`).first()).toBeVisible();
    await page.locator("li, tr", { hasText: `${PROBE} income` }).first().getByRole("button", { name: /Restore/ }).click();
    await expect(page.getByText(`${PROBE} income`)).toHaveCount(0);
    const { data: row } = await admin.from("transactions").select("deleted_at").eq("id", id).single();
    expect(row!.deleted_at).toBeNull();
  });
});

test("quick entry: income with product chip and qty 2 saves and appears in the ledger", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  const b = base("/ (quick entry)");
  await check(b, "sheet opens, chips preselect the last product, qty stepper works, save", async () => {
    await page.getByRole("button", { name: /Add income or expense|^Add$/ }).first().click();
    await expect(page.getByRole("heading", { name: /Add to the ledger/ })).toBeVisible();
    await page.getByRole("radio", { name: "1 kg packs" }).click();
    await page.getByRole("button", { name: "+1" }).click();
    await expect(page.locator("#qe-qty")).toHaveValue("2");
    await expect(page.locator("#qe-amount")).toHaveValue("798");
    await page.getByRole("button", { name: /Add a note/ }).click();
    await page.locator("#qe-note").fill(`${PROBE} quick`);
    await page.getByRole("button", { name: /^Save$/ }).click();
    // The sheet closes at once; the toast gains its Undo action only once the server has saved.
    await expect(page.getByRole("button", { name: /^Undo$/ })).toBeVisible({ timeout: 15_000 });
    await page.goto("/transactions");
    await expect(page.getByText(`${PROBE} quick`).first()).toBeVisible();
  });
  await check(b, "invalid: amount empty is refused inline", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: /Add income or expense|^Add$/ }).first().click();
    await page.locator("#qe-amount").fill("");
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByText(/amount/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test("stock purchase: expense form with lines, backlog moves on Products", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  const b = base("/transactions/new?type=expense");
  await page.goto("/transactions/new?type=expense");
  await check(b, "Stock purchase with 2 units at 260 saves and the backlog shrinks by 2", async () => {
    const { data: before } = await admin.from("stock_movements").select("qty").eq("product_id", BOX_ID);
    const backlogBefore = Math.max(0, -(before ?? []).reduce((a, m) => a + Number(m.qty), 0));
    await page.getByRole("radio", { name: "Stock purchase" }).click();
    await pickProduct(page, "1 kg x 10 packs");
    await page.getByLabel("Qty", { exact: true }).first().fill("2");
    await expect(page.locator("#amount")).toHaveValue("520");
    await page.locator("#note").fill(`${PROBE} purchase`);
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/transactions\?saved=1/, { timeout: 15_000 });
    await page.goto("/products");
    const { data: after } = await admin.from("stock_movements").select("qty").eq("product_id", BOX_ID);
    const backlogAfter = Math.max(0, -(after ?? []).reduce((a, m) => a + Number(m.qty), 0));
    expect(backlogBefore - backlogAfter).toBe(Math.min(2, backlogBefore));
  });
  await check(b, "invalid: amount that does not match the lines is refused", async () => {
    await page.goto("/transactions/new?type=expense");
    await page.getByRole("radio", { name: "Stock purchase" }).click();
    await page.getByLabel("Qty", { exact: true }).first().fill("2");
    await page.locator("#note").fill(`${PROBE} purchase bad`);
    await page.evaluate(() => {
      const el = document.querySelector('input[name="items"]') as HTMLInputElement;
      const rows = JSON.parse(el.value) as { unit_cost: number }[];
      rows[0].unit_cost = 100;
      el.value = JSON.stringify(rows);
    });
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await expect(page).toHaveURL(/error=reconcile/);
  });
});

test("payouts: new payout, reconciliation marks the probe sale as in the bank, edit, invalid amount", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  // A waiting TikTok sale to match.
  await page.goto("/transactions/new?type=income");
  await page.locator("#gross_amount").fill("399");
  await page.locator("#net_amount").fill("377");
  await page.locator("#note").fill(`${PROBE} to-match`);
  await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
  await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

  const b = base("/payouts/new");
  await check(b, "invalid: zero amount is refused", async () => {
    await page.goto("/payouts/new");
    await page.locator("#amount_received").fill("0");
    await page.locator("#note").fill(`${PROBE} payout`);
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await expect(page).toHaveURL(/error=invalid|\/payouts\/new/);
  });
  let payoutId = "";
  await check(b, "valid: payout saves and opens reconciliation with the sale proposed", async () => {
    await page.goto("/payouts/new");
    await page.locator("#amount_received").fill("377");
    await page.locator("#note").fill(`${PROBE} payout`);
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await page.waitForURL(/\/payouts\/[0-9a-f-]{36}\/reconcile/);
    payoutId = page.url().match(/payouts\/([0-9a-f-]{36})/)![1];
    await expect(page.getByText(/Proposed match|matches/i).first()).toBeVisible();
  });
  await shot(page, "/payouts/[id]/reconcile", "admin", "desktop", "en");
  await check(base("/payouts/[id]/reconcile"), "confirm: the sale is now in the bank and linked to the payout", async () => {
    await page.getByRole("button", { name: /Confirm/ }).click();
    await page.waitForURL(/\/payouts(\?|$)/);
    const { data: tx } = await admin.from("transactions").select("id").eq("note", `${PROBE} to-match`).single();
    const { data: s } = await admin.from("settlements").select("status, payout_id").eq("transaction_id", tx!.id).single();
    expect(s).toMatchObject({ status: "received_in_bank", payout_id: payoutId });
  });
  await check(base("/payouts/[id]/edit"), "edit: amount change saves", async () => {
    await page.goto(`/payouts/${payoutId}/edit`);
    await page.locator("#amount_received").fill("378");
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await page.waitForURL(/\/payouts/);
    const { data: p } = await admin.from("payouts").select("amount_received").eq("id", payoutId).single();
    expect(Number(p!.amount_received)).toBe(378);
  });
});

test("transfers on Home: valid saves and shows, invalid is refused", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  const b = base("/ (transfer)");
  await check(b, "invalid: same person both sides", async () => {
    await page.locator('select[name="from_person"]').first().selectOption("mike");
    await page.locator('select[name="to_person"]').first().selectOption("mike");
    await page.locator('input[name="amount"]').first().fill("10");
    await page.locator('textarea[name="note"]').first().fill(`${PROBE} transfer bad`);
    await page.locator('form:has(input[name="amount"]) button[type=submit]').first().click();
    await expect(page).toHaveURL(/transfer=invalid/);
  });
  await check(b, "valid: Mike to Sai 10 baht appears in the transfers list", async () => {
    await page.goto("/");
    await page.locator('select[name="from_person"]').first().selectOption("mike");
    await page.locator('select[name="to_person"]').first().selectOption("sai");
    await page.locator('input[name="amount"]').first().fill("10");
    await page.locator('textarea[name="note"]').first().fill(`${PROBE} transfer`);
    await page.locator('form:has(input[name="amount"]) button[type=submit]').first().click();
    await page.waitForURL(/\/(\?transfer=saved)?$|balance/);
    await page.goto("/");
    await expect(page.getByText(`${PROBE} transfer`).first()).toBeVisible();
  });
});

test("products: create, edit short name, delete and restore; settings and customers forms", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  const b = base("/products/new");
  await check(b, "invalid: empty name is refused by the form", async () => {
    await page.goto("/products/new");
    await page.locator("#p-name").fill("");
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/products\/new/);
  });
  let productId = "";
  await check(b, "valid: product saves and opens its detail", async () => {
    await page.locator("#p-name").fill(`${PROBE} product`);
    await page.locator("#p-variant").fill("test box");
    await page.locator("#p-cost").fill("100");
    await page.locator("#p-price").fill("150");
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await page.waitForURL(/\/products\/[0-9a-f-]{36}\?saved=1/);
    productId = page.url().match(/products\/([0-9a-f-]{36})/)![1];
    await expect(page.getByRole("heading", { name: `${PROBE} product` })).toBeVisible();
  });
  await check(base("/products/[id]/edit"), "edit: short name saves and shows in the picker chips", async () => {
    await page.goto(`/products/${productId}/edit`);
    await page.locator("#p-short").fill("QA short");
    await page.locator("form:has(#date) button[type=submit], form:has(#p-name) button[type=submit]").first().click();
    await page.waitForURL(/saved=1/);
    const { data: p } = await admin.from("products").select("short_name").eq("id", productId).single();
    expect(p!.short_name).toBe("QA short");
  });
  await check(base("/products/[id]"), "delete then restore", async () => {
    await page.goto(`/products/${productId}`);
    await page.getByRole("button", { name: /^Delete$/ }).click();
    await page.waitForURL(/\/products$/);
    await page.goto("/more/deleted");
    await page.locator("li, tr", { hasText: `${PROBE} product` }).first().getByRole("button", { name: /Restore/ }).click();
    await expect(page.getByText(`${PROBE} product`)).toHaveCount(0);
  });
  await check(base("/settings"), "exposure limit saves and is restored", async () => {
    await page.goto("/settings");
    const before = await page.locator("#exposure_limit").inputValue();
    await page.locator("#exposure_limit").fill("3100");
    await page.locator('form:has(#exposure_limit) button[type=submit]').click();
    await page.waitForURL(/\/settings/);
    await expect(page.locator("#exposure_limit")).toHaveValue("3100");
    await page.locator("#exposure_limit").fill(before || "3000");
    await page.locator('form:has(#exposure_limit) button[type=submit]').click();
    await page.waitForURL(/\/settings/);
  });
  await check(base("/customers"), "customers list loads and a note can be saved when a customer exists", async () => {
    await page.goto("/customers");
    const note = page.locator('textarea[name="note"], input[name="note"]').first();
    if ((await note.count()) === 0) {
      test.info().annotations.push({ type: "note", description: "no customers yet; empty state shown" });
      await expect(page.locator("h1")).toHaveText(/Customers/);
      return;
    }
    await note.fill(`${PROBE} note`);
    await note.press("Enter");
  });
});

test("units report toggles and data health run", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  await check(base("/reports/units"), "subtotals and hidden products toggle", async () => {
    await page.goto("/reports/units");
    const sub = page.getByRole("button", { name: /Show subtotals/ });
    if ((await sub.count()) > 0) {
      await sub.click();
      await expect(page.locator("tr.bg-lavender-tint").first()).toBeVisible();
    }
    const all = page.getByRole("button", { name: /Show all products/ });
    if ((await all.count()) > 0) {
      const before = await page.locator("tbody tr").count();
      await all.click();
      expect(await page.locator("tbody tr").count()).toBeGreaterThan(before);
    }
    await expect(page.locator("th", { hasText: /Period/ })).toHaveCSS("position", "sticky");
  });
  await check(base("/more/health"), "run again records a run and Home shows it", async () => {
    await page.goto("/more/health");
    await page.getByRole("link", { name: /Run again/ }).click();
    await expect(page.getByText(/Checked/).first()).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(/Data health:/)).toBeVisible();
  });
  await check(base("/more/check-books"), "books balance on live data", async () => {
    await page.goto("/more/check-books");
    await expect(page.getByText(/All checks pass/)).toBeVisible();
  });
  await check(base("/audit"), "audit export downloads", async () => {
    const res = await page.request.get("/audit/export?format=xlsx");
    expect(res.status()).toBe(200);
  });
  await check(base("/more"), "sign out returns to login", async () => {
    await page.goto("/more");
    await page.getByRole("button", { name: /Sign out/ }).click();
    await page.waitForURL(/\/login/);
  });
});

test("money helper matches the app's format", () => {
  expect(money(4036.59)).toBe("฿4,036.59");
});
