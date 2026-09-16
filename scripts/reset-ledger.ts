/**
 * Wipes the ledger so real data entry can start from zero.
 *
 *   npm run reset:ledger -- --yes
 *
 * Deletes, for the MikiSai business only: settlements, payouts, internal
 * transfers, transactions, customers, report uploads (rows and stored files)
 * and the audit log. Keeps the business, both founder accounts, their
 * profiles and the platform fee settings. Requires SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { SEED_BUSINESS_ID } from "../src/lib/fixtures/seed-data";
import { requireEnv } from "./env";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!process.argv.includes("--yes")) {
  console.error("This wipes every ledger row for the business. Re-run with --yes to confirm.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function count(table: string): Promise<number> {
  const { count: n, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("business_id", SEED_BUSINESS_ID);
  if (error) throw error;
  return n ?? 0;
}

async function main() {
  // Order matters only for readability; foreign keys cascade from transactions and payouts.
  const tables = ["settlements", "payouts", "internal_transfers", "transactions", "customers", "report_uploads", "audit_log"];

  const before: Record<string, number> = {};
  for (const t of tables) before[t] = await count(t);

  // Stored report files live under <business_id>/ in the private bucket.
  const { data: files } = await admin.storage.from("reports").list(SEED_BUSINESS_ID, { limit: 1000 });
  const paths = (files ?? []).map((f) => `${SEED_BUSINESS_ID}/${f.name}`);
  if (paths.length) {
    const { error } = await admin.storage.from("reports").remove(paths);
    if (error) throw error;
  }

  for (const t of tables) {
    const { error } = await admin.from(t).delete().eq("business_id", SEED_BUSINESS_ID);
    if (error) throw error;
  }

  const { data: profiles } = await admin.from("profiles").select("display_name").eq("business_id", SEED_BUSINESS_ID);
  const { count: settings } = await admin.from("platform_settings").select("platform", { count: "exact", head: true }).eq("business_id", SEED_BUSINESS_ID);

  console.log("Removed:");
  for (const t of tables) console.log(`  ${t.padEnd(20)} ${before[t]} -> ${await count(t)}`);
  console.log(`  report files         ${paths.length} -> 0`);
  console.log("Kept:");
  console.log(`  accounts             ${(profiles ?? []).map((p) => p.display_name).join(", ")}`);
  console.log(`  platform settings    ${settings ?? 0} rows`);
  console.log("\nLedger is empty. Tap \"Refresh now\" on Insights (or wait up to an hour) so the live site drops its cached snapshot.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
