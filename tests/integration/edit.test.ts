/**
 * Integration test against the linked Supabase project: opens a row as the
 * admin, changes its date through the app's update path, and asserts both the
 * new date and the audit_log entry the database trigger wrote (before/after).
 * Runs only when the founder credentials are present; probe rows are removed
 * with the service role afterwards, audit rows included.
 *
 *   npm run test:integration
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_BUSINESS_ID } from "@/lib/fixtures/seed-data";
import { applyPayoutUpdate, applyTransactionUpdate, applyTransferUpdate } from "@/lib/ledger/update";
import { toRow } from "@/lib/ledger/transaction-input";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_MIKE_EMAIL;
const password = process.env.SEED_MIKE_PASSWORD;
const ready = Boolean(url && anon && service && email && password);

const suite = ready ? describe : describe.skip;

suite("editing a row through the app's update path", () => {
  const admin = createClient(url!, service!, { auth: { persistSession: false } });
  const mike = createClient(url!, anon!, { auth: { persistSession: false } });
  const ids = { tx: "", payout: "", transfer: "" };
  let mikeId = "";

  beforeAll(async () => {
    const { data, error } = await mike.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw error ?? new Error("sign-in failed");
    mikeId = data.user.id;
    const stamp = new Date().toISOString();
    const tx = await admin
      .from("transactions")
      .insert({ business_id: SEED_BUSINESS_ID, type: "income", date: "2026-09-16", platform: "shopee", product_line: "sugar", gross_amount: 100, net_amount: 90, received_by: "sai", customer_name: "edit-probe", note: "edit-probe", created_by: mikeId, created_at: stamp })
      .select("id")
      .single();
    const po = await admin.from("payouts").insert({ business_id: SEED_BUSINESS_ID, date: "2026-09-16", platform: "shopee", amount_received: 90, received_by: "sai", note: "edit-probe", created_by: mikeId, created_at: stamp }).select("id").single();
    const tf = await admin.from("internal_transfers").insert({ business_id: SEED_BUSINESS_ID, date: "2026-09-16", from_person: "sai", to_person: "mike", amount: 50, kind: "settlement", reason: "profit_settlement", note: "edit-probe", created_by: mikeId, created_at: stamp }).select("id").single();
    if (tx.error || po.error || tf.error) throw tx.error ?? po.error ?? tf.error;
    ids.tx = tx.data.id;
    ids.payout = po.data.id;
    ids.transfer = tf.data.id;
  });

  afterAll(async () => {
    const all = [ids.tx, ids.payout, ids.transfer].filter(Boolean);
    if (!all.length) return;
    await admin.from("transactions").delete().in("id", all);
    await admin.from("payouts").delete().in("id", all);
    await admin.from("internal_transfers").delete().in("id", all);
    await admin.from("audit_log").delete().in("entity_id", all);
  });

  it("changes a transaction's date and records before/after in audit_log", async () => {
    const row = toRow({ type: "income", date: "2026-09-15", platform: "shopee", product_line: "sugar", gross_amount: 100, net_amount: 90, quantity: 1, received_by: "sai", customer_name: "edit-probe", note: "edit-probe" }, SEED_BUSINESS_ID);
    const outcome = await applyTransactionUpdate(mike, SEED_BUSINESS_ID, ids.tx, row);
    expect(outcome).toEqual({ ok: true });

    const { data: after } = await admin.from("transactions").select("date").eq("id", ids.tx).single();
    expect(after?.date).toBe("2026-09-15");

    const { data: audit } = await admin.from("audit_log").select("action, actor_user_id, before, after").eq("entity_id", ids.tx).eq("action", "update").order("created_at", { ascending: false }).limit(1);
    expect(audit?.[0]).toMatchObject({ action: "update", actor_user_id: mikeId, before: { date: "2026-09-16" }, after: { date: "2026-09-15" } });
  });

  it("changes a payout's date the same way", async () => {
    const outcome = await applyPayoutUpdate(mike, SEED_BUSINESS_ID, ids.payout, { date: "2026-09-15", platform: "shopee", amount_received: 90, received_by: "sai", note: "edit-probe" });
    expect(outcome).toEqual({ ok: true });
    const { data: audit } = await admin.from("audit_log").select("before, after").eq("entity_id", ids.payout).eq("action", "update").limit(1);
    expect(audit?.[0]).toMatchObject({ before: { date: "2026-09-16" }, after: { date: "2026-09-15" } });
  });

  it("changes a transfer's date the same way", async () => {
    const outcome = await applyTransferUpdate(mike, SEED_BUSINESS_ID, ids.transfer, { date: "2026-09-15", from_person: "sai", to_person: "mike", amount: 50, kind: "settlement", reason: "profit_settlement", note: "edit-probe" });
    expect(outcome).toEqual({ ok: true });
    const { data: audit } = await admin.from("audit_log").select("before, after").eq("entity_id", ids.transfer).eq("action", "update").limit(1);
    expect(audit?.[0]).toMatchObject({ before: { date: "2026-09-16" }, after: { date: "2026-09-15" } });
  });

  it("reports denied, not an error, when the row cannot be edited", async () => {
    const outcome = await applyPayoutUpdate(mike, "00000000-0000-4000-8000-00000000dead", ids.payout, { date: "2026-09-15", platform: "shopee", amount_received: 90, received_by: "sai", note: "x" });
    expect(outcome).toEqual({ ok: false, reason: "denied" });
  });
});
