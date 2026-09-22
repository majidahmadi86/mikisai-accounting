"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getLedgerSnapshot, ledgerChanged } from "@/lib/data/ledger";
import { purchasesToSplit, SPLIT_TAG } from "@/lib/inventory/variant-split";
import { writeItems } from "@/lib/ledger/insert";

/**
 * Splits each unchecked purchase between its two variants, as the admin
 * counted them: the lines are replaced (stock movements with them) and the
 * row is marked checked, so the question is asked once. The rows are read
 * again on the server, so the form can only change what the page listed.
 */
export async function splitPurchases(formData: FormData): Promise<void> {
  const { supabase, profile } = await requireAdmin("transaction", null, "/stock?error=denied");
  const snapshot = await getLedgerSnapshot(profile.business_id);
  const rows = purchasesToSplit(snapshot.transactions, snapshot.items, snapshot.products, snapshot.categories);
  let failed = 0;
  for (const r of rows) {
    const raw = formData.get(`to_${r.id}`);
    if (raw === null || raw === "") continue;
    const moved = Number(raw);
    if (!Number.isInteger(moved) || moved < 0 || moved > r.qty) {
      failed += 1;
      continue;
    }
    const lines = [
      { product_id: r.from, qty: r.qty - moved, unit_cost: r.unit_cost },
      { product_id: r.to, qty: moved, unit_cost: r.unit_cost },
    ].filter((l) => l.qty > 0);
    const ok = await writeItems(supabase, r.id, lines, "purchase");
    if (!ok) {
      failed += 1;
      continue;
    }
    const tags = snapshot.transactions.find((t) => t.id === r.id)?.tags ?? [];
    const { error } = await supabase.from("transactions").update({ tags: [...new Set([...tags, SPLIT_TAG])] }).eq("id", r.id);
    if (error) failed += 1;
  }
  ledgerChanged(profile.business_id);
  redirect(failed ? "/stock?error=save" : "/stock?saved=1");
}
