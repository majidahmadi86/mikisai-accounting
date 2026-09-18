/**
 * Integration test against the linked Supabase project for the cascade rule:
 * soft-deleting a transaction soft-deletes its lines, movements and settlement
 * in the same database transaction; restoring brings them back; editing a
 * purchase's quantity re-derives its movement; a sale deleted after being
 * matched leaves its payout flagged. Probe rows are removed afterwards.
 *
 *   npm run test:integration
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_BUSINESS_ID } from "@/lib/fixtures/seed-data";
import { writeItems } from "@/lib/ledger/insert";
import { applyTransactionUpdate } from "@/lib/ledger/update";
import { summarisePayoutMatches } from "@/lib/payouts/flags";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_MIKE_EMAIL;
const password = process.env.SEED_MIKE_PASSWORD;
const ready = Boolean(url && anon && service && email && password);
const suite = ready ? describe : describe.skip;

const BOX_1KG = "00000000-0000-4000-8000-0000000000b1";
const STOCK_CATEGORY = "00000000-0000-4000-8000-0000000000c1";

suite("cascade: children live and die with their transaction", () => {
  const admin = createClient(url!, service!, { auth: { persistSession: false } });
  const mike = createClient(url!, anon!, { auth: { persistSession: false } });
  const ids = { purchase: "", sale: "", payout: "" };
  let mikeId = "";

  const liveMovements = async (txId: string) => (await admin.from("stock_movements").select("id, qty, deleted_at").eq("transaction_id", txId)).data ?? [];

  beforeAll(async () => {
    const { data, error } = await mike.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw error ?? new Error("sign-in failed");
    mikeId = data.user.id;
    const purchase = await admin.from("transactions").insert({ business_id: SEED_BUSINESS_ID, type: "expense", date: "2026-09-10", platform: "other", product_line: "sugar", gross_amount: 520, net_amount: 520, payer: "sai", category_id: STOCK_CATEGORY, note: "QA-PROBE cascade purchase", created_by: mikeId }).select("id").single();
    if (purchase.error) throw purchase.error;
    ids.purchase = purchase.data.id;
    expect(await writeItems(mike, ids.purchase, [{ product_id: BOX_1KG, qty: 2, unit_cost: 260 }], "purchase")).toBe(true);

    const sale = await admin.from("transactions").insert({ business_id: SEED_BUSINESS_ID, type: "income", date: "2026-09-10", platform: "shopee", product_line: "sugar", gross_amount: 399, net_amount: 377, received_by: "sai", customer_name: "QA-PROBE cascade", note: "QA-PROBE cascade sale", order_ref: "QAPROBE0001", created_by: mikeId }).select("id").single();
    if (sale.error) throw sale.error;
    ids.sale = sale.data.id;
    expect(await writeItems(mike, ids.sale, [{ product_id: BOX_1KG, qty: 1, unit_price: 399 }], "none")).toBe(true);
    const payout = await admin.from("payouts").insert({ business_id: SEED_BUSINESS_ID, date: "2026-09-11", platform: "shopee", amount_received: 377, received_by: "sai", note: "QA-PROBE cascade payout", created_by: mikeId }).select("id").single();
    if (payout.error) throw payout.error;
    ids.payout = payout.data.id;
    const settlement = await admin.from("settlements").insert({ business_id: SEED_BUSINESS_ID, transaction_id: ids.sale, status: "received_in_bank", settled_at: new Date().toISOString(), payout_id: ids.payout, paid_amount: 377 });
    if (settlement.error) throw settlement.error;
  });

  afterAll(async () => {
    const tx = [ids.purchase, ids.sale].filter(Boolean);
    if (tx.length) {
      await admin.from("stock_movements").delete().in("transaction_id", tx);
      await admin.from("transaction_items").delete().in("transaction_id", tx);
      await admin.from("settlements").delete().in("transaction_id", tx);
      await admin.from("transactions").delete().in("id", tx);
    }
    if (ids.payout) await admin.from("payouts").delete().eq("id", ids.payout);
    await admin.from("audit_log").delete().in("entity_id", [...tx, ids.payout].filter(Boolean));
  });

  it("delete purchase: its movement and line are soft-deleted in the same transaction; restore brings them back", async () => {
    expect((await liveMovements(ids.purchase)).filter((m) => !m.deleted_at)).toHaveLength(1);
    const del = await mike.from("transactions").update({ deleted_at: new Date().toISOString(), deleted_by: mikeId }, { count: "exact" }).eq("id", ids.purchase).is("deleted_at", null);
    expect(del.count).toBe(1);
    const gone = await liveMovements(ids.purchase);
    expect(gone).toHaveLength(1);
    expect(gone[0].deleted_at).not.toBeNull();
    const items = await admin.from("transaction_items").select("deleted_at").eq("transaction_id", ids.purchase);
    expect(items.data?.[0]?.deleted_at).not.toBeNull();

    const restore = await mike.from("transactions").update({ deleted_at: null, deleted_by: null }, { count: "exact" }).eq("id", ids.purchase).not("deleted_at", "is", null);
    expect(restore.count).toBe(1);
    const back = await liveMovements(ids.purchase);
    expect(back[0].deleted_at).toBeNull();
    const itemsBack = await admin.from("transaction_items").select("deleted_at").eq("transaction_id", ids.purchase);
    expect(itemsBack.data?.[0]?.deleted_at).toBeNull();
  });

  it("edit purchase quantity: the movement follows", async () => {
    const outcome = await applyTransactionUpdate(
      mike,
      SEED_BUSINESS_ID,
      ids.purchase,
      { business_id: SEED_BUSINESS_ID, type: "expense", date: "2026-09-10", platform: "other", product_line: "sugar", gross_amount: 780, net_amount: 780, quantity: 3, payer: "sai", received_by: null, category_id: STOCK_CATEGORY, customer_name: null, order_ref: null, note: "QA-PROBE cascade purchase" },
      undefined,
      { list: [{ product_id: BOX_1KG, qty: 3, unit_cost: 260 }], effect: "purchase" },
    );
    expect(outcome).toEqual({ ok: true });
    const movements = await liveMovements(ids.purchase);
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].qty)).toBe(3);
  });

  it("delete a matched sale: its settlement is soft-deleted and the payout shows the order removed", async () => {
    const del = await mike.from("transactions").update({ deleted_at: new Date().toISOString(), deleted_by: mikeId }, { count: "exact" }).eq("id", ids.sale).is("deleted_at", null);
    expect(del.count).toBe(1);
    const { data: settlements } = await admin.from("settlements").select("payout_id, deleted_at, transactions(net_amount)").eq("payout_id", ids.payout);
    const summary = summarisePayoutMatches(
      (settlements ?? []).map((s) => {
        const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
        return { payout_id: s.payout_id, deleted_at: s.deleted_at ?? null, net_amount: Number(tx?.net_amount ?? 0) };
      }),
    );
    expect(summary.get(ids.payout)).toEqual({ count: 0, total: 0, removed: 1, unallocated: 377 });
  });
});
