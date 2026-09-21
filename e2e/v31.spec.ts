/**
 * v3.1: the real TikTok Finance statement (.xlsx, sheets Order details,
 * Withdrawal records, Reports) dropped on the nightly panel at 1440px. The
 * review names the file type and the period before confirm; one confirm
 * applies it; the database holds what TikTok really paid, the refund as a
 * Return cost, the withdrawal as a payout that pays the two settled orders,
 * the pre-business order outside every business row, and an advance balance
 * of 300; Payouts shows that balance; a second drop changes nothing.
 * Everything the file created is removed afterwards with the service role.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { IDS, statementXlsx } from "../tests/fixtures/tiktok/finance-statement";
import { login, widthInvariants } from "./qa/helpers";

config({ path: ".env.local" });

const OUT = "qa-output/screens";
const BUSINESS = "00000000-0000-4000-8000-000000000001";
const ORDER_PREFIX = "57980000000000%";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function cleanup() {
  const { data: txs } = await admin.from("transactions").select("id").eq("business_id", BUSINESS).like("order_ref", ORDER_PREFIX);
  const { data: costs } = await admin.from("transactions").select("id").eq("business_id", BUSINESS).like("note", "Return cost · order #57980000000000%");
  const ids = [...(txs ?? []), ...(costs ?? [])].map((t) => t.id as string);
  const { data: pos } = await admin.from("payouts").select("id").eq("business_id", BUSINESS).eq("external_ref", IDS.withdrawal);
  const payoutIds = (pos ?? []).map((p) => p.id as string);
  if (payoutIds.length) await admin.from("payouts").delete().in("id", payoutIds);
  await admin.from("order_statements").delete().eq("business_id", BUSINESS).like("order_ref", ORDER_PREFIX);
  await admin.from("wallet_events").delete().eq("business_id", BUSINESS).in("reference", [IDS.disbursement, IDS.recovery, IDS.withdrawal, "6600000000000000017", "6600000000000000018", "6600000000000000019"]);
  await admin.from("tiktok_statements").delete().eq("business_id", BUSINESS).eq("period_from", "2026-09-10").eq("period_to", "2026-09-20");
  if (ids.length) {
    for (const table of ["clawbacks", "stock_movements", "transaction_items", "settlements"]) await admin.from(table).delete().in("transaction_id", ids);
    await admin.from("transactions").delete().in("id", ids);
  }
  if (ids.length || payoutIds.length) await admin.from("audit_log").delete().in("entity_id", [...ids, ...payoutIds]);
  await admin.from("import_runs").delete().eq("business_id", BUSINESS).eq("source", "csv").contains("details", { statement: "tiktok-income.xlsx" });
  await admin.from("import_runs").delete().eq("business_id", BUSINESS).eq("source", "csv").contains("details", { nightly: true, files: [{ name: "tiktok-income.xlsx" }] });
}

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  await cleanup();
});
test.afterAll(cleanup);

test("the real Finance statement: one review, one confirm, the right money, and a second drop changes nothing", async ({ page }) => {
  test.setTimeout(240_000);
  const xlsx = Buffer.from(await statementXlsx());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "admin");
  await page.goto("/import");

  // Either drop zone accepts it: the statement goes into the Orders box on purpose.
  await page.locator("#nightly-orders").setInputFiles({ name: "tiktok-income.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsx });
  await expect(page.getByText("Tonight's files")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("TikTok Finance statement", { exact: true })).toBeVisible();
  await expect(page.getByText(/covers 10 Sept 2026 to 20 Sept 2026/)).toBeVisible();
  const card = page.locator("div", { has: page.getByText("What the statement will do", { exact: true }) }).last();
  const value = (label: string) => card.locator("div", { has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd").first();
  await expect(value("New orders")).toHaveText("4");
  await expect(value("Returns and what they cost")).toHaveText("1 · ฿45.00");
  await expect(value("Overweight parcels")).toHaveText("1");
  await expect(value("Moved to the bank")).toHaveText("1 · ฿1,390.92");
  await expect(value("Before MikiSai")).toHaveText("1 · ฿310.00");
  await expect(value("TikTok advance still to be recovered")).toHaveText("฿300.00");
  await widthInvariants(page, 1440);
  await page.screenshot({ path: `${OUT}/v31-statement-review-1440.png`, fullPage: true });

  await page.getByRole("button", { name: /^Confirm \d+$/ }).click();
  // The done card replaces the review only after both the orders and the statement are applied.
  await expect(page.getByText("Tonight's files")).toBeHidden({ timeout: 120_000 });
  await expect(page.getByText(/new order\(s\)/)).toBeVisible({ timeout: 30_000 });

  // What TikTok really paid, not an estimate.
  const { data: orders } = await admin.from("transactions").select("id, order_ref, date, net_amount, gross_amount, quantity, status, tags, settlements(status, settled_at)").eq("business_id", BUSINESS).eq("type", "income").like("order_ref", ORDER_PREFIX).is("deleted_at", null);
  const byRef = new Map((orders ?? []).map((o) => [o.order_ref as string, o]));
  expect(Number(byRef.get(IDS.plain)!.net_amount)).toBe(308.46);
  expect(Number(byRef.get(IDS.heavy)!.net_amount)).toBe(272.46);
  expect(Number(byRef.get(IDS.bundle)!.quantity)).toBe(2);
  expect(Number(byRef.get(IDS.noDetails)!.quantity)).toBe(3);
  expect(byRef.get(IDS.noDetails)!.tags).toContain("qty_inferred");
  // Before 15 Sept: never a ledger row.
  expect(byRef.has(IDS.pre)).toBe(false);
  expect(byRef.has(IDS.refund)).toBe(false);
  const status = (ref: string) => {
    const s = byRef.get(ref)!.settlements as { status: string }[] | { status: string };
    return Array.isArray(s) ? s[0].status : s.status;
  };
  // The withdrawal paid the two orders settled before it; the later two are still in the wallet.
  expect(status(IDS.plain)).toBe("received_in_bank");
  expect(status(IDS.heavy)).toBe("received_in_bank");
  expect(status(IDS.bundle)).toBe("settled_not_withdrawn");
  expect(status(IDS.noDetails)).toBe("settled_not_withdrawn");

  const { data: facts } = await admin.from("order_statements").select("order_ref, kind, pre_business, overweight, fee_seller_shipping, settlement_amount, transaction_id").eq("business_id", BUSINESS).like("order_ref", ORDER_PREFIX);
  expect(facts).toHaveLength(6);
  expect(facts!.find((f) => f.order_ref === IDS.pre)).toMatchObject({ pre_business: true, transaction_id: null });
  expect(facts!.find((f) => f.order_ref === IDS.heavy)).toMatchObject({ overweight: true });
  expect(Number(facts!.find((f) => f.order_ref === IDS.heavy)!.fee_seller_shipping)).toBe(-81);

  const { data: cost } = await admin.from("transactions").select("type, net_amount, category_id, expense_categories(name_en)").eq("business_id", BUSINESS).eq("note", `Return cost · order #${IDS.refund}`).is("deleted_at", null);
  expect(cost).toHaveLength(1);
  expect(cost![0].type).toBe("expense");
  expect(Number(cost![0].net_amount)).toBe(45);

  const { data: payout } = await admin.from("payouts").select("id, amount_received, non_order_amount, note").eq("business_id", BUSINESS).eq("external_ref", IDS.withdrawal).is("deleted_at", null);
  expect(payout).toHaveLength(1);
  expect(Number(payout![0].amount_received)).toBe(1390.92);
  expect(Number(payout![0].non_order_amount)).toBe(810);
  expect(payout![0].note).toContain("1234");

  const { data: events } = await admin.from("wallet_events").select("kind, amount").eq("business_id", BUSINESS).in("reference", [IDS.disbursement, IDS.recovery]);
  const advance = (events ?? []).reduce((a, e) => a + (e.kind === "advance_disbursement" ? Number(e.amount) : e.kind === "advance_recovery" ? -Math.abs(Number(e.amount)) : 0), 0);
  expect(advance).toBe(300);
  expect(events).toHaveLength(2);

  await page.goto("/payouts");
  await expect(page.getByText("TikTok advance still to be recovered: ฿300.00")).toBeVisible();
  await widthInvariants(page, 1440);
  await page.screenshot({ path: `${OUT}/v31-payouts-advance-1440.png` });
  await page.goto("/balance");
  await expect(page.getByText("TikTok advance still to be recovered: ฿300.00")).toBeVisible();
  await page.goto("/more/before");
  await expect(page.getByText(`#${IDS.pre}`).locator("visible=true").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/v31-before-mikisai-1440.png` });

  // Dropping the same file again plans nothing.
  const count = async () => {
    const [a, b, c, d] = await Promise.all([
      admin.from("transactions").select("id", { count: "exact", head: true }).eq("business_id", BUSINESS).like("order_ref", ORDER_PREFIX),
      admin.from("order_statements").select("id", { count: "exact", head: true }).eq("business_id", BUSINESS).like("order_ref", ORDER_PREFIX),
      admin.from("wallet_events").select("id", { count: "exact", head: true }).eq("business_id", BUSINESS).in("reference", [IDS.disbursement, IDS.recovery, IDS.withdrawal]),
      admin.from("payouts").select("id", { count: "exact", head: true }).eq("business_id", BUSINESS).eq("external_ref", IDS.withdrawal),
    ]);
    return [a.count, b.count, c.count, d.count];
  };
  const before = await count();
  await page.goto("/import");
  await page.locator("#nightly-finance").setInputFiles({ name: "tiktok-income.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsx });
  await expect(page.getByText("Tonight's files")).toBeVisible({ timeout: 60_000 });
  const again = page.locator("div", { has: page.getByText("What the statement will do", { exact: true }) }).last();
  await expect(again.locator("div", { has: page.locator("dt", { hasText: /^New orders$/ }) }).locator("dd").first()).toHaveText("0");
  await expect(page.getByRole("button", { name: "Nothing new" })).toBeDisabled();
  expect(await count()).toEqual(before);
});
