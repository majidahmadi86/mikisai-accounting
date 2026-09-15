/**
 * Confirms row level security:
 *   1. an unauthenticated (anon key, no session) client reads zero rows from every table
 *   2. a signed-in founder can read their business rows
 *   3. a signed-in founder cannot insert a row for another business_id
 *
 *   npm run verify:rls
 */
import { createClient } from "@supabase/supabase-js";
import { SEED_BUSINESS_ID } from "../src/lib/fixtures/seed-data";
import { requireEnv } from "./env";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const TABLES = ["businesses", "profiles", "transactions", "settlements", "payouts", "internal_transfers", "customers", "platform_settings", "report_uploads"];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  for (const table of TABLES) {
    const { data, error } = await anon.from(table).select("*").limit(5);
    check(`anon reads nothing from ${table}`, !error && (data?.length ?? 0) === 0, error ? error.message : `${data?.length ?? 0} rows`);
  }
  const { data: files, error: fErr } = await anon.storage.from("reports").list(SEED_BUSINESS_ID);
  check("anon cannot list report files", !!fErr || (files?.length ?? 0) === 0);

  const email = process.env.SEED_MIKE_EMAIL;
  const password = process.env.SEED_MIKE_PASSWORD;
  if (!email || !password) {
    console.log("SKIP  signed-in checks (SEED_MIKE_EMAIL / SEED_MIKE_PASSWORD not set)");
  } else {
    const authed = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signErr } = await authed.auth.signInWithPassword({ email, password });
    check("founder can sign in", !signErr, signErr?.message);
    if (!signErr) {
      const { data: tx, error: txErr } = await authed.from("transactions").select("id").limit(1);
      check("founder reads their transactions", !txErr && (tx?.length ?? 0) > 0, txErr?.message ?? `${tx?.length ?? 0} rows`);

      const { error: insErr } = await authed.from("customers").insert({ business_id: "00000000-0000-4000-8000-00000000dead", name: "rls-probe" });
      check("founder cannot insert for another business", !!insErr, insErr?.message ?? "insert succeeded");
      await authed.from("customers").delete().eq("name", "rls-probe");
    }
  }

  console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} RLS check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
