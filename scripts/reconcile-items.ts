/**
 * Line items must add up to the row they belong to (v2.5). Lists every sale
 * whose lines (qty x sale price per unit) differ from its gross amount by more
 * than five satang, and every stock purchase whose lines (qty x cost) differ
 * from its amount. Single-line rows are fixed by setting the unit price to
 * the row total divided by qty, and the correction is written to audit_log as
 * a system correction. Multi-line mismatches are only listed for the admin.
 *
 *   npm run reconcile:items          # list only
 *   npm run reconcile:items -- --fix # also fix single-line rows
 */
import { createClient } from "@supabase/supabase-js";
import { SEED_BUSINESS_ID } from "../src/lib/fixtures/seed-data";
import { derivedUnitPrice, reconcileLines } from "../src/lib/ledger/reconcile";
import { requireEnv } from "./env";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const fix = process.argv.includes("--fix");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

type Item = { id: string; transaction_id: string; product_id: string; qty: number; unit_price: number; unit_cost: number | null };

async function main() {
  const [{ data: txs, error: e1 }, { data: items, error: e2 }, { data: cats, error: e3 }] = await Promise.all([
    admin.from("transactions").select("id, type, date, gross_amount, net_amount, category_id, note").eq("business_id", SEED_BUSINESS_ID).is("deleted_at", null),
    admin.from("transaction_items").select("id, transaction_id, product_id, qty, unit_price, unit_cost").eq("business_id", SEED_BUSINESS_ID),
    admin.from("expense_categories").select("id, stock_effect").eq("business_id", SEED_BUSINESS_ID),
  ]);
  if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
  const purchaseCats = new Set((cats ?? []).filter((c) => c.stock_effect === "purchase").map((c) => c.id));
  const byTx = new Map<string, Item[]>();
  for (const raw of items ?? []) {
    const it: Item = { ...raw, qty: Number(raw.qty), unit_price: Number(raw.unit_price), unit_cost: raw.unit_cost == null ? null : Number(raw.unit_cost) };
    byTx.set(it.transaction_id, [...(byTx.get(it.transaction_id) ?? []), it]);
  }

  let mismatches = 0;
  let fixed = 0;
  const multi: string[] = [];
  for (const tx of txs ?? []) {
    const lines = byTx.get(tx.id) ?? [];
    if (!lines.length) continue;
    const isSale = tx.type === "income";
    const isPurchase = tx.type === "expense" && tx.category_id && purchaseCats.has(tx.category_id);
    if (!isSale && !isPurchase) continue;
    const total = Number(isSale ? tx.gross_amount : tx.net_amount);
    const r = reconcileLines(
      lines.map((l) => ({ qty: l.qty, price: isSale ? l.unit_price : (l.unit_cost ?? 0) })),
      total,
    );
    if (r.ok) continue;
    mismatches += 1;
    const kind = isSale ? "sale" : "purchase";
    console.log(`${kind}  ${tx.date}  ${tx.id}  row ${total.toFixed(2)}  lines ${r.sum.toFixed(2)}  diff ${r.difference.toFixed(2)}  ${lines.length} line(s)  ${String(tx.note ?? "").slice(0, 60)}`);
    if (lines.length !== 1) {
      multi.push(tx.id);
      continue;
    }
    if (!fix) continue;
    const line = lines[0];
    const price = derivedUnitPrice(total, line.qty);
    const patch = isSale ? { unit_price: price } : { unit_cost: price };
    const before = isSale ? { unit_price: line.unit_price } : { unit_cost: line.unit_cost };
    const { error } = await admin.from("transaction_items").update(patch).eq("id", line.id);
    if (error) {
      console.error(`  could not fix ${line.id}: ${error.message}`);
      continue;
    }
    if (!isSale) await admin.from("stock_movements").update({ unit_cost: price }).eq("transaction_id", tx.id).eq("product_id", line.product_id).eq("kind", "purchase");
    await admin.from("audit_log").insert({
      business_id: SEED_BUSINESS_ID,
      actor_user_id: null,
      action: "update",
      entity_type: "transaction_item",
      entity_id: line.id,
      before,
      after: { ...patch, system_correction: "v2.5 line items reconcile to the row", transaction_id: tx.id, row_total: total, qty: line.qty },
    });
    fixed += 1;
    console.log(`  fixed: ${isSale ? "unit_price" : "unit_cost"} ${String(Object.values(before)[0])} -> ${price}`);
  }

  console.log(`\n${mismatches} mismatching row(s); ${fixed} fixed${fix ? "" : " (dry run, pass --fix to apply)"}.`);
  if (multi.length) console.log(`Multi-line mismatches for the admin to fix by hand: ${multi.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
