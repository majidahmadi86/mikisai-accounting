/**
 * Admin flows: every main form is filled and saved (valid and invalid), and
 * the ledger and the relevant report are asserted to have moved. Probe rows
 * carry a QA-PROBE note and are removed afterwards through the service role.
 */
import { expect, test } from "@playwright/test";
import { admin, BOX_ID, BUSINESS, check, cleanupProbes, addExpense, addPayout, addSale, login, money, openAdd, PROBE, probeOrderId, setLang, shot, VIEWPORTS } from "./helpers";

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

  const b = base("Add · Sale");
  const saleRef = probeOrderId();
  await check(b, "invalid: a sale with no order ID is refused inline", async () => {
    await openAdd(page, "Sale");
    await page.getByRole("dialog").getByRole("button", { name: "Save sale" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(/Add the order ID/);
    await page.keyboard.press("Escape");
  });
  await shot(page, "/add-sale-invalid", "admin", "desktop", "en");

  await check(b, "valid: qty 2 prefills what you receive and saves", async () => {
    await addSale(page, { ref: saleRef, qty: 2, receive: 754, customer: `${PROBE} income`, note: `${PROBE} income` });
    await page.goto("/transactions");
  });


  await check(base("/transactions"), "ledger shows the row with product x qty", async () => {
    const row = page.locator("tr", { hasText: `${PROBE} income` }).first();
    await expect(row.getByText("1 kg packs × 2", { exact: true })).toBeVisible();
  });
  await shot(page, "/transactions-after-save", "admin", "desktop", "en");

  await check(base("/reports"), "reports revenue equals the ledger sum for the month, probe included", async () => {
    await page.goto("/reports?period=month");
    const after = await tileValue(page, /You received/i);
    expect(after).toBeGreaterThan(revenueBefore - 1);
    const now = new Date();
    const first = `${now.toISOString().slice(0, 7)}-01`;
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const { data, error } = await admin.from("transactions").select("net_amount").eq("business_id", BUSINESS).eq("type", "income").eq("status", "active").is("deleted_at", null).gte("date", first).lt("date", next); // a cancelled order is not revenue
    expect(error).toBeNull();
    const ledger = Math.round((data ?? []).reduce((a, r) => a + Number(r.net_amount), 0) * 100) / 100;
    expect(after).toBe(ledger);
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
    const deletedRow = page.locator("li, tr", { hasText: `${PROBE} income` }).filter({ visible: true }).first();
    await expect(deletedRow).toBeVisible();
    await deletedRow.getByRole("button", { name: /Restore/ }).click();
    await expect(page.locator("li, tr", { hasText: `${PROBE} income` }).filter({ visible: true })).toHaveCount(0);
    const { data: row } = await admin.from("transactions").select("deleted_at").eq("id", id).single();
    expect(row!.deleted_at).toBeNull();
  });
});

test("expense through Add: a plain expense saves with Undo, an empty amount is refused", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  const b = base("Add · Expense");
  await check(b, "Stock purchase and Samples are the first two choices", async () => {
    await openAdd(page, "Expense");
    const names = await page.getByRole("dialog").getByRole("radiogroup", { name: "What did you pay for?" }).getByRole("radio").allInnerTexts();
    expect(names.slice(0, 2).join(" | ")).toMatch(/Stock purchase.*\|.*Sample/i);
    await page.keyboard.press("Escape");
  });
  await check(b, "valid: Packaging 120 saves and offers Undo", async () => {
    await addExpense(page, { category: "Packaging", amount: 120, note: `${PROBE} quick` });
    // The sheet closes at once; the toast gains its Undo action only once the server has saved.
    await expect(page.getByRole("button", { name: /^Undo$/ })).toBeVisible({ timeout: 15_000 });
  });
  await check(b, "invalid: amount empty is refused inline", async () => {
    await page.goto("/");
    await openAdd(page, "Expense");
    await page.getByRole("dialog").getByRole("radio", { name: "Packaging", exact: true }).click();
    await page.locator("#qe-amount").fill("");
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByRole("dialog").locator(".bg-berry-tint").first()).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test("stock purchase through Add: units and cost per unit give the amount, the backlog moves", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  const b = base("Add · Expense (stock purchase)");
  await check(b, "Stock purchase with 2 units at 260 saves and the backlog shrinks by 2", async () => {
    const { data: before } = await admin.from("stock_movements").select("qty").eq("product_id", BOX_ID);
    const backlogBefore = Math.max(0, -(before ?? []).reduce((a, m) => a + Number(m.qty), 0));
    await openAdd(page, "Expense");
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("radio", { name: "Stock purchase", exact: true }).click();
    await sheet.getByRole("radio", { name: "1 kg packs", exact: true }).click();
    await sheet.locator("#qe-qty").fill("2");
    await sheet.locator("#qe-cost").fill("260");
    await expect(sheet.locator("#qe-amount")).toHaveValue("520");
    await sheet.getByRole("button", { name: /Add a note/ }).click();
    await sheet.locator("#qe-note").fill(`${PROBE} purchase`);
    await sheet.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByRole("button", { name: /^Undo$/ })).toBeVisible({ timeout: 15_000 });
    const { data: after } = await admin.from("stock_movements").select("qty").eq("product_id", BOX_ID);
    const backlogAfter = Math.max(0, -(after ?? []).reduce((a, m) => a + Number(m.qty), 0));
    expect(backlogBefore - backlogAfter).toBe(Math.min(2, backlogBefore));
  });
  await check(b, "invalid: an amount that does not match units times cost is refused by the server", async () => {
    await page.goto("/");
    await addExpense(page, { category: "Stock purchase", product: "1 kg packs", qty: 2, unitCost: 260, amount: 100, note: `${PROBE} purchase bad` });
    await expect(page.getByText(/do not add up/)).toBeVisible({ timeout: 15_000 });
    const { data } = await admin.from("transactions").select("id").eq("business_id", BUSINESS).eq("note", `${PROBE} purchase bad`);
    expect(data ?? []).toEqual([]);
  });
});

test("payouts: new payout, reconciliation marks the probe sale as in the bank, edit, invalid amount", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  // A waiting TikTok sale to match.
  await addSale(page, { ref: probeOrderId(), receive: 377, customer: `${PROBE} match`, note: `${PROBE} to-match` });

  const b = base("Add · Payout received");
  await check(b, "invalid: zero amount is refused", async () => {
    await page.goto("/payouts");
    await openAdd(page, "Payout received");
    await page.locator("#po-amount").fill("0");
    await page.getByRole("dialog").getByRole("button", { name: /Save and match/ }).click();
    await expect(page).toHaveURL(/\/payouts(\?error=invalid)?$/);
    await page.keyboard.press("Escape");
  });
  let payoutId = "";
  await check(b, "valid: payout saves and opens the matching page with the sale proposed", async () => {
    await page.goto("/payouts");
    payoutId = await addPayout(page, 377, `${PROBE} payout`);
    await expect(page.getByText(/add up to the payout|closest set/i).first()).toBeVisible();
  });
  await shot(page, "/payouts/[id]/reconcile", "admin", "desktop", "en");
  await check(base("/payouts/[id]/reconcile"), "confirm: only the probe sale is ticked, it is then in the bank and linked to the payout", async () => {
    // The proposal ticks the oldest waiting orders; never touch Mike's real orders. Tick the probe only.
    const rows = page.locator("table tbody tr");
    const n = await rows.count();
    for (let i = 0; i < n; i += 1) {
      const row = rows.nth(i);
      const box = row.locator('input[type="checkbox"]');
      if ((await box.count()) === 0) continue;
      const wanted = (await row.innerText()).includes(`${PROBE} match`);
      if ((await box.isChecked()) !== wanted) await box.click();
    }
    await expect(page.locator("table tbody tr").filter({ has: page.locator('input[type="checkbox"]:checked') })).toHaveCount(1);
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
    await page.waitForURL(/\/payouts(\?|$)/, { timeout: 15_000 });
    const { data: p } = await admin.from("payouts").select("amount_received").eq("id", payoutId).single();
    expect(Number(p!.amount_received)).toBe(378);
  });
});

test("money moved through Add: the sheet saves a valid transfer and refuses Other without a note", async ({ page, context }) => {
  await setLang(context, "en");
  await login(page, "admin");
  const b = base("Add · Money moved");
  await check(b, "invalid: Other without a note is refused inline", async () => {
    await openAdd(page, "Money moved");
    await page.getByRole("radio", { name: "Other, say what" }).click();
    await page.locator("#ts-amount").fill("10");
    await page.locator("#ts-note").fill("");
    await page.locator("#ts-note").evaluate((el) => (el as HTMLTextAreaElement).removeAttribute("required"));
    await page.getByRole("button", { name: "Record transfer" }).click();
    await expect(page.locator("p.text-berry", { hasText: /note is required/i })).toBeVisible();
  });
  await check(b, "valid: Mike to Sai 10 baht is saved and listed on Investment", async () => {
    await page.getByRole("radio", { name: "My half of a cost the other paid" }).click();
    await page.getByRole("radio", { name: "Mike" }).click();
    await page.locator("#ts-amount").fill("10");
    await page.locator("#ts-note").fill(`${PROBE} transfer`);
    await page.getByRole("button", { name: "Record transfer" }).click();
    await expect(page.getByText(/Recorded: Mike sent Sai/)).toBeVisible({ timeout: 15_000 });
    const { data } = await admin.from("internal_transfers").select("amount").eq("business_id", BUSINESS).eq("note", `${PROBE} transfer`).is("deleted_at", null);
    expect((data ?? []).map((r) => Number(r.amount))).toEqual([10]);
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
    const deletedProduct = page.locator("li, tr", { hasText: `${PROBE} product` }).filter({ visible: true }).first();
    await deletedProduct.getByRole("button", { name: /Restore/ }).click();
    await expect(page.locator("li, tr", { hasText: `${PROBE} product` }).filter({ visible: true })).toHaveCount(0);
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
    // v3.0: the table never scrolls sideways, so nothing needs to stick; its box fits its card.
    const fit = await page.locator("main table").first().evaluate((t) => [t.parentElement!.scrollWidth, t.parentElement!.clientWidth]);
    expect(fit[0]).toBe(fit[1]);
  });
  await check(base("/more/health"), "run again records a run", async () => {
    await page.goto("/more/health");
    await page.getByRole("link", { name: /Run again/ }).click();
    await expect(page.getByText(/Checked/).first()).toBeVisible();
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
    await page.locator("main").getByRole("button", { name: /Sign out/ }).click();
    await page.waitForURL(/\/login/);
  });
});

test("money helper matches the app's format", () => {
  expect(money(4036.59)).toBe("฿4,036.59");
});
