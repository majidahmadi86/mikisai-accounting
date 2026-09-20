/**
 * Admin edits everything: rows created by the contributor (an income, an
 * expense, a payout and a transfer) can be opened, edited and soft-deleted
 * by the admin, and the ledger row reads "created by Sai · edited by Mike".
 * Any missing Edit control or RLS denial fails the test. Probe rows are
 * removed afterwards.
 */
import { expect, test, type Page } from "@playwright/test";
import { admin, BUSINESS, check, cleanupProbes, login, PROBE, probeOrderId, setLang, VIEWPORTS } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ viewport: VIEWPORTS.desktop });

const base = (route: string) => ({ route, role: "admin" as const, viewport: "desktop" as const, lang: "en" as const });
const submit = (page: Page) => page.locator("form:has(#date) button[type=submit]").first();

test.beforeAll(async () => {
  await cleanupProbes();
});
test.afterAll(async () => {
  await cleanupProbes();
});

test("contributor creates four rows; admin edits and deletes each", async ({ browser }) => {
  test.setTimeout(180_000);
  const sai = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const saiPage = await sai.newPage();
  await setLang(sai, "en");
  await login(saiPage, "contributor");

  await saiPage.goto("/transactions/new?type=income");
  await saiPage.locator("#gross_amount").fill("399");
  await saiPage.locator("#net_amount").fill("377");
  await saiPage.locator("#order_ref").fill(probeOrderId());
  await saiPage.locator("#note").fill(`${PROBE} sai income`);
  await submit(saiPage).click();
  await expect(saiPage).toHaveURL(/saved=1/, { timeout: 15_000 });

  await saiPage.goto("/transactions/new?type=expense");
  await saiPage.getByRole("radio", { name: "Packaging" }).click();
  await saiPage.locator("#amount").fill("120");
  await saiPage.locator("#note").fill(`${PROBE} sai expense`);
  await submit(saiPage).click();
  await expect(saiPage).toHaveURL(/saved=1/, { timeout: 15_000 });

  await saiPage.goto("/payouts/new");
  await saiPage.locator("#amount_received").fill("377");
  await saiPage.locator("#note").fill(`${PROBE} sai payout`);
  await submit(saiPage).click();
  await saiPage.waitForURL(/\/payouts\/[0-9a-f-]{36}\/reconcile/, { timeout: 15_000 });

  await saiPage.goto("/");
  await saiPage.getByRole("button", { name: "Record an internal transfer" }).click();
  await saiPage.getByRole("radio", { name: "Sai" }).click();
  await saiPage.locator("#ts-amount").fill("5");
  await saiPage.locator("#ts-note").fill(`${PROBE} sai transfer`);
  await saiPage.getByRole("button", { name: "Record transfer" }).click();
  await expect(saiPage.getByText(/Recorded: Sai sent Mike/)).toBeVisible({ timeout: 15_000 });
  await sai.close();

  const { data: income } = await admin.from("transactions").select("id").eq("business_id", BUSINESS).eq("note", `${PROBE} sai income`).single();
  const { data: expense } = await admin.from("transactions").select("id").eq("business_id", BUSINESS).eq("note", `${PROBE} sai expense`).single();
  const { data: payout } = await admin.from("payouts").select("id").eq("business_id", BUSINESS).eq("note", `${PROBE} sai payout`).single();
  const { data: transfer } = await admin.from("internal_transfers").select("id").eq("business_id", BUSINESS).eq("note", `${PROBE} sai transfer`).single();

  const mike = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page = await mike.newPage();
  await setLang(mike, "en");
  await login(page, "admin");

  await check(base("/transactions/[id]/edit"), "admin edits the contributor's income and the row says created by Sai · edited by Mike", async () => {
    await page.goto(`/transactions/${income!.id}/edit`);
    await expect(page.getByRole("button", { name: /^Delete$/ })).toBeVisible();
    await page.locator("#customer_name").fill(`${PROBE} edited by mike`);
    await submit(page).click();
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
    // The byline lives in the row detail since v3.0: open it from the chevron.
    const row = page.locator("tr", { hasText: `${PROBE} edited by mike` }).first();
    await row.getByRole("button", { name: /Show details/ }).click();
    const detail = page.locator("tr", { hasText: /created by Sai/ }).first();
    await expect(detail.getByText(/created by Sai/)).toBeVisible();
    await expect(detail.getByText(/edited by Mike/)).toBeVisible();
  });
  await check(base("/transactions/[id]/edit"), "admin edits the contributor's expense", async () => {
    await page.goto(`/transactions/${expense!.id}/edit`);
    await page.locator("#amount").fill("130");
    await submit(page).click();
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
    const { data } = await admin.from("transactions").select("net_amount, updated_by").eq("id", expense!.id).single();
    expect(Number(data!.net_amount)).toBe(130);
    expect(data!.updated_by).not.toBeNull();
  });
  await check(base("/payouts/[id]/edit"), "admin edits the contributor's payout", async () => {
    await page.goto(`/payouts/${payout!.id}/edit`);
    await page.locator("#amount_received").fill("378");
    await submit(page).click();
    await page.waitForURL(/\/payouts(\?|$)/, { timeout: 15_000 });
    const { data } = await admin.from("payouts").select("amount_received").eq("id", payout!.id).single();
    expect(Number(data!.amount_received)).toBe(378);
  });
  await check(base("/transfers/[id]/edit"), "admin edits the contributor's transfer", async () => {
    await page.goto(`/transfers/${transfer!.id}/edit`);
    await page.locator('input[name="amount"]').first().fill("6");
    await page.locator('form:has(input[name="amount"]) button[type=submit]').first().click();
    await page.waitForURL(/transfer=saved/, { timeout: 15_000 });
    const { data } = await admin.from("internal_transfers").select("amount").eq("id", transfer!.id).single();
    expect(Number(data!.amount)).toBe(6);
  });
  await check(base("/transactions/[id]/edit"), "admin soft-deletes all four contributor rows", async () => {
    for (const path of [`/transactions/${income!.id}/edit`, `/transactions/${expense!.id}/edit`, `/payouts/${payout!.id}/edit`, `/transfers/${transfer!.id}/edit`]) {
      await page.goto(path);
      await page.getByRole("button", { name: /^Delete$/ }).first().click();
      await page.waitForTimeout(800);
    }
    const { data: t } = await admin.from("transactions").select("id, deleted_at").in("id", [income!.id, expense!.id]);
    expect(t!.every((r) => r.deleted_at)).toBe(true);
    const { data: p } = await admin.from("payouts").select("deleted_at").eq("id", payout!.id).single();
    expect(p!.deleted_at).not.toBeNull();
    const { data: tf } = await admin.from("internal_transfers").select("deleted_at").eq("id", transfer!.id).single();
    expect(tf!.deleted_at).not.toBeNull();
  });
  await mike.close();
});
