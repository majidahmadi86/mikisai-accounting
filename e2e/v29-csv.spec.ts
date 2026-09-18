/**
 * v2.9-CSV at 1440px: the Nightly TikTok panel, a mixed review from the two
 * Seller Center fixture files (Thai headers, Buddhist years, a cancelled
 * order, an order paid 70% then 30%), one confirm, Payouts after the match,
 * and the same files dropped again changing nothing. Every row is a probe and
 * is removed afterwards.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const OUT = "qa-output/screens";
const FILES = ["tests/fixtures/seller-center/orders-th.csv", "tests/fixtures/seller-center/finance-th.csv"];
const BUSINESS = "00000000-0000-4000-8000-000000000001";
const O1 = "579900000000000101";
const O3 = "579900000000000103";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function cleanup() {
  const { data: txs } = await admin.from("transactions").select("id").like("order_ref", "5799000000000001%");
  const ids = (txs ?? []).map((t) => t.id as string);
  const { data: pos } = await admin.from("payouts").select("id").like("external_ref", "7599000000000000%");
  const payoutIds = (pos ?? []).map((p) => p.id as string);
  if (payoutIds.length) await admin.from("payouts").delete().in("id", payoutIds);
  if (ids.length) {
    for (const table of ["clawbacks", "stock_movements", "transaction_items", "settlements"]) await admin.from(table).delete().in("transaction_id", ids);
    await admin.from("transactions").delete().in("id", ids);
  }
  if (ids.length || payoutIds.length) await admin.from("audit_log").delete().in("entity_id", [...ids, ...payoutIds]);
  await admin.from("tiktok_sku_map").delete().eq("sku_key", "id:1729500000000000001");
  await admin.from("import_runs").delete().eq("source", "csv").contains("details", { nightly: true });
}

test.beforeAll(async () => {
  await cleanup();
  // The cancelled order is already in the ledger as a live sale, so the file has something to cancel.
  const { data: mike } = await admin.from("profiles").select("id").eq("business_id", BUSINESS).eq("role", "admin").limit(1).single();
  const { data: tx, error } = await admin.from("transactions").insert({ business_id: BUSINESS, type: "income", date: "2026-09-16", platform: "tiktok", product_line: "sugar", gross_amount: 399, net_amount: 367.08, received_by: "sai", customer_name: "ploy_p", note: "QA-PROBE nightly", order_ref: O3, created_by: mike!.id }).select("id").single();
  if (error) throw error;
  await admin.from("settlements").insert({ business_id: BUSINESS, transaction_id: tx!.id, status: "pending" });
});
test.afterAll(cleanup);

test("Nightly panel: drop both exports, one review, one confirm; 70/30 payouts; a second drop changes nothing", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.goto("/login");
  await page.locator("#email").fill(process.env.SEED_MIKE_EMAIL!);
  await page.locator("#password").fill(process.env.SEED_MIKE_PASSWORD!);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL("**/");
  await expect(page.getByText("Export, drop, confirm")).toBeVisible();

  await page.goto("/import");
  await expect(page.getByText("Drop the two Seller Center exports")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Orders in Seller Center/ })).toHaveAttribute("href", /seller-th\.tiktok\.com/);
  await page.screenshot({ path: `${OUT}/nightly-panel-1440.png` });

  // Either box takes either file: both go into the Orders box.
  await page.locator("#nightly-orders").setInputFiles(FILES);
  await expect(page.getByText("Tonight's files")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText("2 ready", { exact: true })).toBeVisible();
  await expect(page.getByText("1 need a look")).toBeVisible();
  await expect(page.getByText("1 status change(s)")).toBeVisible();
  await expect(page.getByText("2 payout(s)", { exact: true })).toBeVisible();
  await expect(page.getByText("pays 2 of 2 order(s), ฿880.99")).toBeVisible();
  await expect(page.getByText("pays 1 of 1 order(s), ฿220.25")).toBeVisible();
  await page.getByRole("button", { name: "Show them" }).click();
  await expect(page.getByText(`#${O1}`).first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/nightly-review-mixed-1440.png`, fullPage: true });

  // The row that needs a look stays out tonight (no settlement yet); everything else in one confirm.
  await page.locator("table thead input[type=checkbox]").first().uncheck();
  await page.getByRole("button", { name: /^Confirm 5$/ }).click();
  await expect(page.getByText(/2 new order\(s\), 1 cancellation\(s\), 2 payout\(s\)/)).toBeVisible({ timeout: 60_000 });

  // The database: cancellation applied, one order paid by two payouts and now in the bank.
  const { data: cancelled } = await admin.from("transactions").select("status").eq("order_ref", O3).single();
  expect(cancelled?.status).toBe("cancelled");
  const { data: o1 } = await admin.from("transactions").select("id").eq("order_ref", O1).single();
  const { data: s1 } = await admin.from("settlements").select("id, status, paid_amount").eq("transaction_id", o1!.id).single();
  expect([s1?.status, Number(s1?.paid_amount)]).toEqual(["received_in_bank", 734.16]);
  const { data: allocations } = await admin.from("payout_allocations").select("amount").eq("settlement_id", s1!.id);
  expect((allocations ?? []).map((a) => Number(a.amount)).sort((a, b) => a - b)).toEqual([220.25, 513.91]);

  await page.goto("/payouts");
  await expect(page.locator("table").getByText("฿880.99").first()).toBeVisible();
  await expect(page.locator("table").getByText("฿220.25").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/payouts-after-7030-1440.png` });

  // The same files again: nothing to save.
  await page.goto("/import");
  await page.locator("#nightly-finance").setInputFiles(FILES);
  await expect(page.getByText("Tonight's files")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText("0 ready", { exact: true })).toBeVisible();
  await expect(page.getByText("0 status change(s)")).toBeVisible();
  await expect(page.getByText("0 payout(s)", { exact: true })).toBeVisible();
  await expect(page.getByText("5 already in the ledger")).toBeVisible();
  const before = await admin.from("transactions").select("id", { count: "exact", head: true }).like("order_ref", "5799000000000001%");
  expect(before.count).toBe(3);
});
