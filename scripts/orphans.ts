/**
 * Lists movements, lines and settlements whose parent transaction is deleted
 * (the orphans migration 0020 soft-deletes), and notes that still carry a
 * "#<digits>" order number (migration 0021 moves it to order_ref). Read only;
 * run before and after `npx supabase db push` to print what changed.
 *
 *   npx tsx scripts/orphans.ts
 */
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

const db = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function main() {
  const { data: deleted } = await db.from("transactions").select("id, date, type, net_amount, note, deleted_at").not("deleted_at", "is", null);
  const ids = (deleted ?? []).map((t) => t.id);
  console.log(`Deleted transactions: ${ids.length}`);
  for (const t of deleted ?? []) console.log("  DELETED", JSON.stringify(t));
  if (ids.length) {
    const [mv, it, se] = await Promise.all([
      db.from("stock_movements").select("id, transaction_id, product_id, qty, kind, date, deleted_at").in("transaction_id", ids),
      db.from("transaction_items").select("id, transaction_id, product_id, qty, deleted_at").in("transaction_id", ids),
      db.from("settlements").select("id, transaction_id, status, payout_id, deleted_at").in("transaction_id", ids),
    ]);
    const live = (rows: { deleted_at?: string | null }[] | null) => (rows ?? []).filter((r) => !("deleted_at" in r) || r.deleted_at == null);
    console.log(`Orphaned movements still live: ${live(mv.data).length}`);
    for (const r of mv.data ?? []) console.log("  MOVEMENT", JSON.stringify(r));
    console.log(`Orphaned items still live: ${live(it.data).length}`);
    for (const r of it.data ?? []) console.log("  ITEM", JSON.stringify(r));
    console.log(`Orphaned settlements still live: ${live(se.data).length}`);
    for (const r of se.data ?? []) console.log("  SETTLEMENT", JSON.stringify(r));
  }
  const { data: withRef } = await db.from("transactions").select("id, date, note, order_ref").like("note", "%#%").is("deleted_at", null).order("date");
  const pending = (withRef ?? []).filter((t) => /#\d{6,}/.test(t.note ?? ""));
  console.log(`Notes still carrying an order number: ${pending.length}`);
  for (const t of pending) console.log("  NOTE", JSON.stringify(t));
  const { data: refs } = await db.from("transactions").select("id, date, note, order_ref").not("order_ref", "is", null).order("date");
  console.log(`Rows with order_ref: ${(refs ?? []).length}`);
  for (const t of refs ?? []) console.log("  REF", JSON.stringify(t));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
