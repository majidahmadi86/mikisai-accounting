/**
 * Data correction through the normal update path (v2.8, section 0a): the
 * 16 Sept 2026 stock purchase of ฿3,120 for 12 boxes was recorded on
 * "500 g packs" but the boxes were 1 kg packs. Signs in as the admin and
 * re-saves the row through applyTransactionUpdate with its one line moved to
 * the 1 kg product, so the replace_transaction_items RPC re-derives the stock
 * movements atomically, row level security and the audit triggers apply, and
 * a system-correction audit entry carries before and after. Prints the row,
 * its lines and its movements before and after.
 *
 *   NODE_OPTIONS="--require ./scripts/preload-server-only.cjs" npx tsx scripts/correct-purchase-product.ts            # print, no change
 *   NODE_OPTIONS="--require ./scripts/preload-server-only.cjs" npx tsx scripts/correct-purchase-product.ts -- --apply  # apply
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

const FROM_PRODUCT = "00000000-0000-4000-8000-0000000000b2"; // 500 g packs
const TO_PRODUCT = "00000000-0000-4000-8000-0000000000b1"; // 1 kg packs
const DATE = "2026-09-16";
const AMOUNT = 3120;
const QTY = 12;

async function snapshot(db: SupabaseClient, id: string, label: string) {
  const [{ data: row }, { data: items }, { data: movements }] = await Promise.all([
    db.from("transactions").select("id, date, type, category_id, net_amount, quantity, payer, note, updated_by, updated_at").eq("id", id).single(),
    db.from("transaction_items").select("product_id, qty, unit_cost").eq("transaction_id", id),
    db.from("stock_movements").select("product_id, qty, kind, unit_cost, date").eq("transaction_id", id),
  ]);
  console.log(`${label} row      `, JSON.stringify(row));
  console.log(`${label} items    `, JSON.stringify(items));
  console.log(`${label} movements`, JSON.stringify(movements));
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
    console.log(`No expense of ฿${AMOUNT} dated ${DATE} found.`);
    return;
  }
  const before = await snapshot(mike, row.id, "BEFORE");
  const onWrongProduct = (before.items ?? []).some((i) => i.product_id === FROM_PRODUCT);
  if (!onWrongProduct) {
    console.log("Already on 1 kg packs; nothing to do.");
    return;
  }
  if (!apply) {
    console.log("Dry run. Pass --apply to move the line to 1 kg packs and re-derive its movements.");
    return;
  }

  const patch: TransactionInsert = {
    business_id: SEED_BUSINESS_ID,
    type: "expense",
    date: row.date,
    platform: row.platform,
    product_line: row.product_line,
    gross_amount: Number(row.gross_amount),
    net_amount: Number(row.net_amount),
    quantity: QTY,
    payer: row.payer,
    received_by: null,
    category_id: row.category_id,
    customer_name: null,
    note: row.note ?? "",
  };
  const unitCost = Math.round((AMOUNT / QTY) * 100) / 100;
  const outcome = await applyTransactionUpdate(mike, SEED_BUSINESS_ID, row.id, patch, undefined, { list: [{ product_id: TO_PRODUCT, qty: QTY, unit_cost: unitCost }], effect: "purchase" });
  if (!outcome.ok) throw new Error(`update refused: ${outcome.reason} ${outcome.message ?? ""}`);

  const { error: noteError } = await mike.rpc("record_action", {
    p_action: "update",
    p_entity_type: "system_correction",
    p_entity_id: row.id,
    p_before: { entity: "transaction", items: before.items, movements: before.movements },
    p_after: { entity: "transaction", items: [{ product_id: TO_PRODUCT, qty: QTY, unit_cost: unitCost }], why: "v2.8: the 16 Sept purchase of 12 boxes was 1 kg packs, not 500 g packs; line and stock movements moved" },
  });
  if (noteError) throw new Error(`system correction not recorded: ${noteError.message}`);
  console.log("Audit: system_correction row written.");
  await snapshot(mike, row.id, "AFTER ");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
