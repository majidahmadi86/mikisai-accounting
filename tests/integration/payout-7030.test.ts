/**
 * Integration test against the linked Supabase project: one order paid by two
 * payouts (70% early, 30% later), through commitRows the way the nightly
 * files and the API sync write. Also: the same payout twice is recorded once.
 * Probe rows are removed afterwards.
 *
 *   npm run test:integration
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { SEED_BUSINESS_ID } from "@/lib/fixtures/seed-data";
import { commitRows, CommitSchema } from "@/lib/import/commit";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const suite = url && service ? describe : describe.skip;

const REF = "QAPROBE7030";
const P1 = "QAPROBE7030-P1";
const P2 = "QAPROBE7030-P2";
const BOX_1KG = "00000000-0000-4000-8000-0000000000b1";

suite("an order covered by two payouts", () => {
  const admin = createClient(url!, service!, { auth: { persistSession: false } });
  const audit = async () => {};

  afterAll(async () => {
    const { data: txs } = await admin.from("transactions").select("id").eq("order_ref", REF);
    const ids = (txs ?? []).map((t) => t.id as string);
    const { data: pos } = await admin.from("payouts").select("id").in("external_ref", [P1, P2]);
    const payoutIds = (pos ?? []).map((p) => p.id as string);
    if (payoutIds.length) await admin.from("payouts").delete().in("id", payoutIds);
    if (ids.length) {
      for (const table of ["stock_movements", "transaction_items", "settlements"]) await admin.from(table).delete().in("transaction_id", ids);
      await admin.from("transactions").delete().in("id", ids);
    }
    await admin.from("audit_log").delete().in("entity_id", [...ids, ...payoutIds]);
    await admin.from("import_runs").delete().eq("business_id", SEED_BUSINESS_ID).contains("details", { probe: REF });
  });

  it("70% then 30%: pending with the part paid, then in the bank, both payouts matched to the same order; a repeat changes nothing", async () => {
    const { data: mike } = await admin.from("profiles").select("id").eq("business_id", SEED_BUSINESS_ID).eq("role", "admin").limit(1).single();
    const row = { date: "2026-09-15", platform: "tiktok", product_line: "sugar", gross_amount: 798, net_amount: 734.16, received_by: "sai", status: "settled_not_withdrawn", customer_name: "QA-PROBE", order_id: REF, note: "QA-PROBE 70/30", product_id: BOX_1KG, quantity: 2 };
    const early = CommitSchema.parse({ source: "csv", rows: [row], payouts: [{ date: "2026-09-17", platform: "tiktok", amount: 513.91, received_by: "sai", note: "QA-PROBE", external_ref: P1, allocations: [{ order_ref: REF, amount: 513.91 }] }], details: { probe: REF } });
    const first = await commitRows(admin, SEED_BUSINESS_ID, early, { createdBy: mike!.id as string, audit });
    expect(first).toMatchObject({ ok: true, inserted: 1, payouts: 1 });

    const settlement = async () => {
      const { data: tx } = await admin.from("transactions").select("id").eq("order_ref", REF).single();
      const { data: s } = await admin.from("settlements").select("id, status, paid_amount, payout_id").eq("transaction_id", tx!.id).single();
      const { data: allocations } = await admin.from("payout_allocations").select("amount, payouts!inner(external_ref)").eq("settlement_id", s!.id);
      return { s: s!, allocations: (allocations ?? []).map((a) => [(Array.isArray(a.payouts) ? a.payouts[0] : a.payouts)?.external_ref, Number(a.amount)]).sort() };
    };
    let state = await settlement();
    expect(state.s.status).toBe("pending");
    expect(Number(state.s.paid_amount)).toBe(513.91);
    expect(state.allocations).toEqual([[P1, 513.91]]);

    const late = CommitSchema.parse({ source: "csv", payouts: [{ date: "2026-09-25", platform: "tiktok", amount: 220.25, received_by: "sai", note: "QA-PROBE", external_ref: P2, allocations: [{ order_ref: REF, amount: 220.25 }] }], details: { probe: REF } });
    expect(await commitRows(admin, SEED_BUSINESS_ID, late, { createdBy: mike!.id as string, audit })).toMatchObject({ ok: true, payouts: 1 });
    state = await settlement();
    expect(state.s.status).toBe("received_in_bank");
    expect(Number(state.s.paid_amount)).toBe(734.16);
    expect(state.allocations).toEqual([[P1, 513.91], [P2, 220.25]]);

    // The same files again: the order is skipped by its number, both payouts by their payment ids.
    const again = await commitRows(admin, SEED_BUSINESS_ID, CommitSchema.parse({ source: "csv", rows: [row], payouts: [...early.payouts, ...late.payouts], details: { probe: REF } }), { createdBy: mike!.id as string, audit });
    expect(again).toMatchObject({ ok: true, inserted: 0, payouts: 0, skipped: 3 });
    expect((await settlement()).allocations).toEqual([[P1, 513.91], [P2, 220.25]]);
  });
});
