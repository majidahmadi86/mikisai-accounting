/**
 * v2.8 screens at 375px: the share-to-app flow (install card, service worker
 * share landing on /import), a Seller Center export in review with gold tags,
 * the Ledger with Order IDs, and the cancel flow on a quick order. Probe rows
 * are removed with the service role afterwards.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

const OUT = "qa-output/screens";
const PROBE_REF = `QAPROBE${Date.now().toString().slice(-8)}`;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function login(page: Page, who: "mike" | "sai") {
  await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
  await page.goto("/login");
  await page.locator("#email").fill(who === "mike" ? process.env.SEED_MIKE_EMAIL! : process.env.SEED_SAI_EMAIL!);
  await page.locator("#password").fill(who === "mike" ? process.env.SEED_MIKE_PASSWORD! : process.env.SEED_SAI_PASSWORD!);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL("**/");
}

test.afterAll(async () => {
  const { data } = await admin.from("transactions").select("id").eq("order_ref", PROBE_REF);
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length) {
    await admin.from("clawbacks").delete().in("transaction_id", ids);
    await admin.from("stock_movements").delete().in("transaction_id", ids);
    await admin.from("transaction_items").delete().in("transaction_id", ids);
    await admin.from("settlements").delete().in("transaction_id", ids);
    await admin.from("transactions").delete().in("id", ids);
    await admin.from("audit_log").delete().in("entity_id", ids);
  }
  await admin.from("import_runs").delete().eq("source", "quick").gte("ran_at", new Date(Date.now() - 3600_000).toISOString());
});

test("share-to-app: install card for Sai, and a share lands on /import with the files", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, "sai");
  await expect(page.getByText("Install MikiSai, then share order screenshots to it")).toBeVisible();
  await page.screenshot({ path: `${OUT}/share-install-card-375.png`, fullPage: false });

  // The manifest declares the share target; the worker answers a share POST and parks the files.
  const manifest = await page.evaluate(async () => (await fetch("/manifest.webmanifest")).json());
  expect(manifest.share_target.action).toBe("/import/share");
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    void reg;
  });
  await page.reload();
  const landed = await page.evaluate(async () => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append("screenshots", new File([png], "order.png", { type: "image/png" }));
    const res = await fetch("/import/share", { method: "POST", body: fd });
    return { url: res.url, cached: (await (await caches.open("mikisai-shared")).keys()).length };
  });
  expect(landed.url).toContain("/import?shared=1");
  expect(landed.cached).toBe(1);
  await page.goto("/import?shared=1");
  await expect(page.getByText(/screenshot\(s\) received from the share/)).toBeVisible();
  await page.screenshot({ path: `${OUT}/share-landed-import-375.png` });
});

test("Seller Center export in review with gold tags; Ledger with Order ID; quick order then Mark cancelled", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, "mike");

  // A real order number already in the ledger, so the review shows "already recorded".
  const { data: existing } = await admin.from("transactions").select("order_ref").eq("type", "income").not("order_ref", "is", null).is("deleted_at", null).limit(1).single();
  const known = existing?.order_ref ?? "586083280131032082";
  const csv = [
    "Order ID,Order Status,Created Time,Paid Time,Product Name,Variation,Quantity,SKU Subtotal After Discount,Order Amount,Buyer Username",
    `${PROBE_REF}1,Completed,18/09/2569 20:10:11,18/09/2569 20:12:00,Coconut sugar Rung Nirand Amphawa,10 kg box (1 kg x 10 packs),1,399,399,qa_buyer_a`,
    `${PROBE_REF}2,Cancelled,18/09/2569 20:20:11,,Coconut sugar Rung Nirand Amphawa,10 kg box (1 kg x 10 packs),2,798,798,qa_buyer_b`,
    `${known},Completed,15/09/2569 10:00:00,15/09/2569 10:01:00,Coconut sugar Rung Nirand Amphawa,10 kg box (1 kg x 10 packs),2,798,798,qa_buyer_c`,
  ].join("\n");
  await page.goto("/import");
  await page.locator("#table-file").setInputFiles({ name: "orders.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await expect(page.getByText("Review before saving")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("already recorded").first()).toBeVisible();
  await expect(page.getByText("cancelled", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/1 of 3 rows will be saved|2 of 3 rows will be saved/)).toBeVisible();
  await page.screenshot({ path: `${OUT}/import-review-tags-375.png`, fullPage: true });

  // Ledger: copyable Order IDs.
  await page.goto("/transactions");
  await expect(page.getByRole("button", { name: /^Copy [0-9A-Z]/ }).first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/ledger-order-id-375.png` });

  // Quick order: three fields, one tap.
  await page.goto("/");
  await page.getByRole("button", { name: "Quick order" }).first().click();
  await expect(page.getByRole("heading", { name: "Quick order" })).toBeVisible();
  await page.locator("#qo-ref").fill(PROBE_REF);
  await page.getByRole("button", { name: "One more" }).click();
  await page.screenshot({ path: `${OUT}/quick-order-375.png` });
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByText(/Order saved: 2 unit/)).toBeVisible({ timeout: 15_000 });

  // Search finds it by order number; Mark cancelled is one tap away.
  await page.goto(`/search?q=${PROBE_REF}`);
  await expect(page.getByRole("button", { name: `Copy ${PROBE_REF}` })).toBeVisible();
  await page.getByRole("button", { name: "Mark cancelled" }).first().click();
  await page.locator("input[placeholder='optional']").first().fill("QA-PROBE customer changed mind");
  await page.screenshot({ path: `${OUT}/cancel-flow-375.png` });
  await page.getByRole("button", { name: "Cancel this order" }).click();
  await expect(page.getByRole("button", { name: "Reinstate" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Mark cancelled" })).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/cancel-done-375.png` });

  // The database did the whole thing in one go: status, return movement, no clawback (nothing was paid out).
  const { data: row } = await admin.from("transactions").select("id, status, refund_amount").eq("order_ref", PROBE_REF).single();
  expect(row?.status).toBe("cancelled");
  const { data: returns } = await admin.from("stock_movements").select("qty, kind").eq("transaction_id", row!.id).eq("kind", "return").is("deleted_at", null);
  expect(returns?.map((m) => Number(m.qty))).toEqual([2]);
  const { data: claws } = await admin.from("clawbacks").select("id").eq("transaction_id", row!.id);
  expect(claws ?? []).toHaveLength(0);
});
