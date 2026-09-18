/**
 * Local end-to-end run of the TikTok sync against scripts/tiktok-mock-server.ts
 * and the linked Supabase project, for verifying the pipeline before TikTok
 * approves the app. Every row it writes is a probe (order numbers
 * 5764614130382201xx, payment ids 75000000000000000xx) and --cleanup removes
 * all of it, the connection and the log rows included.
 *
 *   npx tsx scripts/tiktok-mock-server.ts 4545 --safe-payouts          # terminal 1
 *   NODE_OPTIONS="--require ./scripts/preload-server-only.cjs" npx tsx scripts/tiktok-sync-local.ts -- --run
 *   NODE_OPTIONS="--require ./scripts/preload-server-only.cjs" npx tsx scripts/tiktok-sync-local.ts -- --cleanup
 *
 * Refuses to run when a real connection exists.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SEED_BUSINESS_ID } from "../src/lib/fixtures/seed-data";
import { requireEnv } from "./env";

const BASE = process.env.TIKTOK_MOCK_BASE ?? "http://127.0.0.1:4545";
const PROBE_ORDERS = "5764614130382201%";
const PROBE_PAYMENTS = "75000000000000000%";
const db = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function cleanup() {
  const { data: txs } = await db.from("transactions").select("id").eq("business_id", SEED_BUSINESS_ID).like("order_ref", PROBE_ORDERS);
  const ids = (txs ?? []).map((t) => t.id as string);
  if (ids.length) {
    for (const table of ["clawbacks", "stock_movements", "transaction_items", "settlements"]) await db.from(table).delete().in("transaction_id", ids);
    await db.from("transactions").delete().in("id", ids);
    await db.from("audit_log").delete().in("entity_id", ids);
  }
  const { data: payouts } = await db.from("payouts").select("id").eq("business_id", SEED_BUSINESS_ID).like("external_ref", PROBE_PAYMENTS);
  const payoutIds = (payouts ?? []).map((p) => p.id as string);
  if (payoutIds.length) {
    await db.from("payouts").delete().in("id", payoutIds);
    await db.from("audit_log").delete().in("entity_id", payoutIds);
  }
  await db.from("sync_queue").delete().eq("business_id", SEED_BUSINESS_ID).like("order_ref", PROBE_ORDERS);
  await db.from("import_runs").delete().eq("business_id", SEED_BUSINESS_ID).eq("source", "tiktok");
  await db.from("sync_log").delete().eq("business_id", SEED_BUSINESS_ID);
  await db.from("tiktok_connections").delete().eq("business_id", SEED_BUSINESS_ID).eq("open_id", "mock-open-id");
  await db.from("audit_log").delete().eq("business_id", SEED_BUSINESS_ID).contains("after", { by: "tiktok_sync" });
  console.log(`cleanup: ${ids.length} probe orders, ${payoutIds.length} probe payouts, queue, log and mock connection removed`);
}

async function run() {
  process.env.TIKTOK_APP_KEY = "mock_app_key";
  process.env.TIKTOK_APP_SECRET = "mock_app_secret";
  process.env.TIKTOK_API_BASE = BASE;
  process.env.TIKTOK_AUTH_BASE = BASE;
  process.env.TIKTOK_TOKEN_KEY = process.env.TIKTOK_TOKEN_KEY ?? randomBytes(32).toString("base64");
  const { exchangeAuthCode, TikTokClient } = await import("../src/lib/tiktok/client");
  const { encryptSecret } = await import("../src/lib/tiktok/crypto");
  const { runTiktokSync, tiktokConfig } = await import("../src/lib/tiktok/sync");

  const { data: existing } = await db.from("tiktok_connections").select("open_id").eq("business_id", SEED_BUSINESS_ID).maybeSingle();
  if (existing && existing.open_id !== "mock-open-id") throw new Error("A real TikTok connection exists; the local run will not touch it.");

  const config = tiktokConfig()!;
  // The same steps the callback takes: code to tokens, tokens to shop, stored encrypted.
  const tokens = await exchangeAuthCode(config, "mock-auth-code");
  const shop = (await new TikTokClient(config, { accessToken: tokens.accessToken }).getAuthorizedShops())[0];
  const { data: mike } = await db.from("profiles").select("id").eq("business_id", SEED_BUSINESS_ID).eq("role", "admin").limit(1).single();
  const { error } = await db.from("tiktok_connections").upsert({ business_id: SEED_BUSINESS_ID, shop_id: shop.id, shop_cipher: shop.cipher, shop_name: `${shop.name} (mock)`, region: shop.region, seller_name: tokens.sellerName, open_id: tokens.openId, access_token_enc: encryptSecret(tokens.accessToken), refresh_token_enc: encryptSecret(tokens.refreshToken), access_expires_at: new Date(tokens.accessExpiresAt * 1000).toISOString(), refresh_expires_at: new Date(tokens.refreshExpiresAt * 1000).toISOString(), status: "connected", connected_by: mike?.id ?? null, connected_at: new Date().toISOString() }, { onConflict: "business_id" });
  if (error) throw error;

  for (const trigger of ["manual", "cron"] as const) {
    const summary = await runTiktokSync(db, SEED_BUSINESS_ID, trigger);
    console.log(`${trigger}:`, JSON.stringify(summary));
  }
  const { data: rows } = await db.from("transactions").select("order_ref, date, quantity, gross_amount, net_amount, status, created_by").eq("business_id", SEED_BUSINESS_ID).like("order_ref", PROBE_ORDERS);
  console.log("ledger rows:", JSON.stringify(rows));
  const { data: queue } = await db.from("sync_queue").select("order_ref, reasons, status").eq("business_id", SEED_BUSINESS_ID).like("order_ref", PROBE_ORDERS);
  console.log("queue:", JSON.stringify(queue));
  const { data: payouts } = await db.from("payouts").select("date, amount_received, external_ref, note").eq("business_id", SEED_BUSINESS_ID).like("external_ref", PROBE_PAYMENTS);
  console.log("payouts:", JSON.stringify(payouts));
  const { data: moves } = await db.from("stock_movements").select("kind, qty, transactions!inner(order_ref)").like("transactions.order_ref", PROBE_ORDERS);
  console.log("movements:", JSON.stringify(moves));
}

(process.argv.includes("--cleanup") ? cleanup() : process.argv.includes("--run") ? run() : Promise.reject(new Error("pass --run or --cleanup"))).catch((err) => {
  console.error(err);
  process.exit(1);
});
