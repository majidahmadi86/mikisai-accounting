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

const TABLES = ["businesses", "profiles", "transactions", "settlements", "payouts", "internal_transfers", "customers", "platform_settings", "report_uploads", "audit_log"];

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
      // An empty ledger is fine (fresh install); what matters is that the query is allowed.
      check("founder can query their transactions", !txErr, txErr?.message ?? `${tx?.length ?? 0} rows`);

      const { error: insErr } = await authed.from("customers").insert({ business_id: "00000000-0000-4000-8000-00000000dead", name: "rls-probe" });
      check("founder cannot insert for another business", !!insErr, insErr?.message ?? "insert succeeded");
      await authed.from("customers").delete().eq("name", "rls-probe");

      // Nobody may write audit rows directly; triggers and record_action() are the only writers.
      const { error: auditInsErr } = await authed.from("audit_log").insert({ business_id: SEED_BUSINESS_ID, actor_user_id: "00000000-0000-4000-8000-000000000000", action: "export", entity_type: "report" });
      check("founder cannot insert audit rows directly", !!auditInsErr, auditInsErr?.message ?? "insert succeeded");

      // Audit rows are append-only: a member can read, never update or delete.
      const { data: audit } = await authed.from("audit_log").select("id").order("created_at", { ascending: false }).limit(1);
      const auditId = audit?.[0]?.id;
      if (auditId) {
        const { data: upd } = await authed.from("audit_log").update({ entity_type: "tampered" }).eq("id", auditId).select("id");
        check("founder cannot update audit rows", (upd?.length ?? 0) === 0, `${upd?.length ?? 0} rows changed`);
        const { data: del } = await authed.from("audit_log").delete().eq("id", auditId).select("id");
        check("founder cannot delete audit rows", (del?.length ?? 0) === 0, `${del?.length ?? 0} rows removed`);
      } else {
        console.log("SKIP  audit immutability (no audit rows yet)");
      }
    }
  }

  await roleChecks();

  console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} RLS check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * Role rules, run against the live project with the two founder accounts.
 * Probe rows are created with the service role and removed again (including
 * the audit rows they generate), so nothing is left behind.
 */
async function roleChecks() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mikeEmail = process.env.SEED_MIKE_EMAIL;
  const mikePassword = process.env.SEED_MIKE_PASSWORD;
  const saiEmail = process.env.SEED_SAI_EMAIL;
  const saiPassword = process.env.SEED_SAI_PASSWORD;
  if (!serviceKey || !mikeEmail || !mikePassword || !saiEmail || !saiPassword) {
    console.log("SKIP  role checks (service key or founder credentials not set)");
    return;
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const mike = createClient(url, anonKey, { auth: { persistSession: false } });
  const sai = createClient(url, anonKey, { auth: { persistSession: false } });
  const [{ error: mErr }, { error: sErr }] = await Promise.all([mike.auth.signInWithPassword({ email: mikeEmail, password: mikePassword }), sai.auth.signInWithPassword({ email: saiEmail, password: saiPassword })]);
  if (mErr || sErr) {
    check("both founders can sign in", false, mErr?.message ?? sErr?.message);
    return;
  }
  const { data: profiles } = await admin.from("profiles").select("id, display_name, role").eq("business_id", SEED_BUSINESS_ID);
  const mikeId = profiles?.find((p) => p.display_name === "Mike")?.id;
  const saiId = profiles?.find((p) => p.display_name === "Sai")?.id;
  check("Mike is admin, Sai is contributor", profiles?.find((p) => p.id === mikeId)?.role === "admin" && profiles?.find((p) => p.id === saiId)?.role === "contributor");
  if (!mikeId || !saiId) return;

  const probe = { business_id: SEED_BUSINESS_ID, type: "expense", date: "2020-01-01", platform: "other", product_line: "other", gross_amount: 1, net_amount: 1, payer: "mike", category: "other", note: "rls-probe" };
  const { data: rows, error: insErr } = await admin
    .from("transactions")
    .insert([
      { ...probe, created_by: mikeId, created_at: new Date().toISOString() },
      { ...probe, created_by: saiId, created_at: new Date().toISOString() },
      { ...probe, created_by: saiId, created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    ])
    .select("id, created_by, created_at");
  if (insErr || !rows || rows.length !== 3) {
    check("probe rows created", false, insErr?.message);
    return;
  }
  const [mikeRow, saiFresh, saiOld] = rows;
  const ids = rows.map((r) => r.id);
  try {
    const upd = async (client: typeof sai, id: string, patch: Record<string, unknown>) => {
      const { count, error } = await client.from("transactions").update(patch, { count: "exact" }).eq("id", id);
      return { count: count ?? 0, error };
    };
    const del = async (client: typeof sai, id: string) => {
      const { count, error } = await client.from("transactions").delete({ count: "exact" }).eq("id", id);
      return { count: count ?? 0, error };
    };

    check("contributor cannot hard-delete", (await del(sai, saiFresh.id)).count === 0);
    check("contributor cannot edit another user's row", (await upd(sai, mikeRow.id, { note: "x" })).count === 0);
    check("contributor cannot edit own row older than 24h", (await upd(sai, saiOld.id, { note: "x" })).count === 0);
    check("contributor can edit own fresh row", (await upd(sai, saiFresh.id, { note: "edited" })).count === 1);
    const { count: setCount } = await sai.from("platform_settings").update({ commission_pct: 1 }, { count: "exact" }).eq("business_id", SEED_BUSINESS_ID).eq("platform", "other");
    check("contributor cannot change settings", (setCount ?? 0) === 0);
    const { count: bizCount } = await sai.from("businesses").update({ exposure_limit: 1 }, { count: "exact" }).eq("id", SEED_BUSINESS_ID);
    check("contributor cannot change the exposure limit", (bizCount ?? 0) === 0);
    const { data: auditRows, error: auditErr } = await sai.from("audit_log").select("id").limit(1);
    check("contributor cannot read the audit log", !auditErr && (auditRows?.length ?? 0) === 0);

    check("admin can soft-delete any row", (await upd(mike, saiOld.id, { deleted_at: new Date().toISOString(), deleted_by: mikeId })).count === 1);
    check("admin can restore", (await upd(mike, saiOld.id, { deleted_at: null, deleted_by: null })).count === 1);
    check("admin cannot hard-delete", (await del(mike, saiOld.id)).count === 0);
    const { data: still } = await admin.from("transactions").select("id").in("id", ids);
    check("nobody hard-deleted anything", (still?.length ?? 0) === 3);
    const { data: trail } = await admin.from("audit_log").select("action").eq("entity_id", saiOld.id).order("created_at");
    const actions = (trail ?? []).map((r) => r.action);
    check("soft delete and restore are audited as such", actions.includes("soft_delete") && actions.includes("restore"), actions.join(","));
  } finally {
    await admin.from("transactions").delete().in("id", ids);
    await admin.from("audit_log").delete().in("entity_id", ids);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
