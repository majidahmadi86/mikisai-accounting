/**
 * v3.3 purchase split, through the normal update path. Signs in as the admin
 * and re-saves each week-1 purchase through applyTransactionUpdate with its
 * lines on the real variants, so replace_transaction_items re-derives the
 * stock movements atomically and the audit triggers record who and what; a
 * system-correction row carries before and after. Dates and amounts stay.
 *
 *   16 Sept, 12 boxes, 3,120:  12 x 1 kg packs
 *   20 Sept, 32 boxes, 8,320:  26 x 1 kg packs + 6 x 500 g packs
 *   21 Sept,  8 boxes, 2,080:   8 x 500 g packs (was entered on "Sample sugar B")
 *   Bought: 38 x 1 kg, 14 x 500 g; with 38 and 14 sold, nothing owed and nothing on hand.
 *
 *   NODE_OPTIONS="--require ./scripts/preload-server-only.cjs" npx tsx scripts/v33-purchases.ts            # print, no change
 *   NODE_OPTIONS="--require ./scripts/preload-server-only.cjs" npx tsx scripts/v33-purchases.ts -- --apply  # apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_BUSINESS_ID } from "../src/lib/fixtures/seed-data";
import { SPLIT_TAG } from "../src/lib/inventory/variant-split";
import { applyTransactionUpdate } from "../src/lib/ledger/update";
import type { TransactionInsert } from "../src/lib/ledger/transaction-input";
import { requireEnv } from "./env";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const email = requireEnv("SEED_MIKE_EMAIL");
const password = requireEnv("SEED_MIKE_PASSWORD");
const apply = process.argv.includes("--apply");

const KG1 = "00000000-0000-4000-8000-0000000000b1";
const G500 = "00000000-0000-4000-8000-0000000000b2";

const PLAN: { date: string; amount: number; lines: { product_id: string; qty: number }[] }[] = [
  { date: "2026-09-16", amount: 3120, lines: [{ product_id: KG1, qty: 12 }] },
  { date: "2026-09-20", amount: 8320, lines: [{ product_id: KG1, qty: 26 }, { product_id: G500, qty: 6 }] },
  { date: "2026-09-21", amount: 2080, lines: [{ product_id: G500, qty: 8 }] },
];

async function snapshot(db: SupabaseClient, id: string, label: string) {
  const [{ data: row }, { data: items }, { data: movements }] = await Promise.all([
    db.from("transactions").select("id, date, net_amount, quantity, payer, tags").eq("id", id).single(),
    db.from("transaction_items").select("product_id, qty, unit_cost").eq("transaction_id", id).is("deleted_at", null),
    db.from("stock_movements").select("product_id, qty, kind, unit_cost").eq("transaction_id", id).is("deleted_at", null),
  ]);
  console.log(`${label} ${JSON.stringify(row)}\n   items ${JSON.stringify(items)}\n   movements ${JSON.stringify(movements)}`);
  return { row, items, movements };
}

async function main() {
  const mike = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await mike.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  for (const p of PLAN) {
    const { data: rows, error } = await mike.from("transactions").select("*").eq("business_id", SEED_BUSINESS_ID).eq("type", "expense").eq("date", p.date).is("deleted_at", null);
    if (error) throw error;
    const row = (rows ?? []).find((r) => Number(r.net_amount) === p.amount);
    if (!row) {
      console.log(`No purchase of ${p.amount} dated ${p.date}.`);
      continue;
    }
    const before = await snapshot(mike, row.id, "BEFORE");
    const qty = p.lines.reduce((a, l) => a + l.qty, 0);
    const unitCost = Math.round((p.amount / qty) * 100) / 100;
    const list = p.lines.map((l) => ({ ...l, unit_cost: unitCost }));
    const same = JSON.stringify((before.items ?? []).map((i) => [i.product_id, Number(i.qty)]).sort()) === JSON.stringify(list.map((l) => [l.product_id, l.qty]).sort());
    if (!apply) {
      console.log(same ? "   already right" : `   would become ${JSON.stringify(list)}`);
      continue;
    }
    if (!same) {
      const patch: TransactionInsert = { business_id: SEED_BUSINESS_ID, type: "expense", date: row.date, platform: row.platform, product_line: row.product_line, gross_amount: Number(row.gross_amount), net_amount: Number(row.net_amount), quantity: qty, payer: row.payer, received_by: null, category_id: row.category_id, customer_name: null, order_ref: null, note: row.note ?? "" };
      const outcome = await applyTransactionUpdate(mike, SEED_BUSINESS_ID, row.id, patch, undefined, { list, effect: "purchase" });
      if (!outcome.ok) throw new Error(`update refused: ${outcome.reason} ${outcome.message ?? ""}`);
      const { error: noteError } = await mike.rpc("record_action", {
        p_action: "update",
        p_entity_type: "system_correction",
        p_entity_id: row.id,
        p_before: { entity: "transaction", items: before.items, movements: before.movements },
        p_after: { entity: "transaction", items: list, why: "v3.3: week-1 purchases are 38 x 1 kg packs and 14 x 500 g packs; lines and stock movements moved, date and amount kept" },
      });
      if (noteError) throw new Error(`system correction not recorded: ${noteError.message}`);
    }
    const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
    if (!tags.includes(SPLIT_TAG)) {
      const { error: tagError } = await mike.from("transactions").update({ tags: [...tags, SPLIT_TAG] }).eq("id", row.id);
      if (tagError) throw tagError;
    }
    await snapshot(mike, row.id, "AFTER ");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
