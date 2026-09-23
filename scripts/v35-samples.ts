/**
 * v3.5: the ฿890 of samples was one box of each real sugar, not three
 * placeholder products. Signs in as the admin and re-saves the row through
 * applyTransactionUpdate with its lines on the real products, so the sample
 * movements (a box in, a box given away) are re-derived atomically and the
 * audit triggers record it; the date and the ฿890 stay. Then the three
 * "Sample sugar A/B/C" placeholders are soft-deleted, and a product with no
 * purchase of its own takes its first cost from this box.
 *
 *   1 kg packs   1 box   296.67
 *   Mali        10 bags  296.70  (10 x 29.67, the satang a bag allows)
 *   Rock sugar   1 box   296.63  (so the three still total exactly 890.00)
 *
 *   NODE_OPTIONS="--require ./scripts/preload-server-only.cjs" npx tsx scripts/v35-samples.ts            # print, no change
 *   NODE_OPTIONS="--require ./scripts/preload-server-only.cjs" npx tsx scripts/v35-samples.ts -- --apply  # apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_BUSINESS_ID } from "../src/lib/fixtures/seed-data";
import { applyTransactionUpdate } from "../src/lib/ledger/update";
import type { TransactionInsert } from "../src/lib/ledger/transaction-input";
import { requireEnv } from "./env";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const email = requireEnv("SEED_MIKE_EMAIL");
const password = requireEnv("SEED_MIKE_PASSWORD");
const apply = process.argv.includes("--apply");

const KG1 = "00000000-0000-4000-8000-0000000000b1";
const MALI = "00000000-0000-4000-8000-0000000000b6";
const ROCK = "00000000-0000-4000-8000-0000000000b7";
const PLACEHOLDERS = ["00000000-0000-4000-8000-0000000000b3", "00000000-0000-4000-8000-0000000000b4", "00000000-0000-4000-8000-0000000000b5"];
const DATE = "2026-09-14";
const AMOUNT = 890;

const LINES = [
  { product_id: KG1, qty: 1, unit_cost: 296.67 },
  { product_id: MALI, qty: 10, unit_cost: 29.67 },
  { product_id: ROCK, qty: 1, unit_cost: 296.63 },
];

async function snapshot(db: SupabaseClient, id: string, label: string) {
  const [{ data: row }, { data: items }, { data: movements }, { data: products }] = await Promise.all([
    db.from("transactions").select("id, date, net_amount, quantity, payer").eq("id", id).single(),
    db.from("transaction_items").select("product_id, qty, unit_cost").eq("transaction_id", id).is("deleted_at", null),
    db.from("stock_movements").select("product_id, qty, kind, unit_cost").eq("transaction_id", id).is("deleted_at", null),
    db.from("products").select("id, name_en, short_name, default_cost, deleted_at").eq("business_id", SEED_BUSINESS_ID).in("id", [...PLACEHOLDERS, KG1, MALI, ROCK]),
  ]);
  console.log(`${label} row ${JSON.stringify(row)}`);
  console.log(`${label} items ${JSON.stringify(items)}`);
  console.log(`${label} movements ${JSON.stringify(movements)}`);
  console.log(`${label} products ${JSON.stringify(products)}`);
  return { row, items, movements };
}

async function main() {
  const mike = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await mike.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: rows, error } = await mike.from("transactions").select("*").eq("business_id", SEED_BUSINESS_ID).eq("type", "expense").eq("date", DATE).is("deleted_at", null);
  if (error) throw error;
  const row = (rows ?? []).find((r) => Number(r.net_amount) === AMOUNT);
  if (!row) {
    console.log(`No expense of ${AMOUNT} dated ${DATE}.`);
    return;
  }
  const before = await snapshot(mike, row.id, "BEFORE");
  console.log(`Lines total ${LINES.reduce((a, l) => a + l.qty * l.unit_cost, 0).toFixed(2)} against the row's ${AMOUNT}`);
  if (!apply) {
    console.log(`Dry run. Would become ${JSON.stringify(LINES)} and retire ${PLACEHOLDERS.length} placeholder products.`);
    return;
  }

  const patch: TransactionInsert = { business_id: SEED_BUSINESS_ID, type: "expense", date: row.date, platform: row.platform, product_line: row.product_line, gross_amount: Number(row.gross_amount), net_amount: Number(row.net_amount), quantity: LINES.reduce((a, l) => a + l.qty, 0), payer: row.payer, received_by: null, category_id: row.category_id, customer_name: null, order_ref: null, note: row.note ?? "" };
  const outcome = await applyTransactionUpdate(mike, SEED_BUSINESS_ID, row.id, patch, undefined, { list: LINES, effect: "sample" });
  if (!outcome.ok) throw new Error(`update refused: ${outcome.reason} ${outcome.message ?? ""}`);

  // A product that has never been bought takes its first cost from this box, to be confirmed with the factory.
  for (const line of LINES) {
    const { data: p } = await mike.from("products").select("id, default_cost").eq("id", line.product_id).single();
    if (p && Number(p.default_cost) === 0) await mike.from("products").update({ default_cost: line.unit_cost }).eq("id", line.product_id);
  }

  const { error: retireError } = await mike.from("products").update({ deleted_at: new Date().toISOString() }).in("id", PLACEHOLDERS).eq("business_id", SEED_BUSINESS_ID).is("deleted_at", null);
  if (retireError) throw retireError;

  const { error: noteError } = await mike.rpc("record_action", {
    p_action: "update",
    p_entity_type: "system_correction",
    p_entity_id: row.id,
    p_before: { entity: "transaction", items: before.items, movements: before.movements },
    p_after: { entity: "transaction", items: LINES, why: "v3.5: the 890 of samples was one box of each real sugar; the three placeholder products are retired" },
  });
  if (noteError) throw new Error(`system correction not recorded: ${noteError.message}`);
  await snapshot(mike, row.id, "AFTER ");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
