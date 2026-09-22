/**
 * Ledger cleanup, dry run (v3.2). Prints what More > Clean the ledger will do
 * for a week: duplicates removed, typed rows merged into their imported twin,
 * cancellations that never shipped, sales moved to their real variant, typed
 * rows left for the admin, and the week's counts before and after.
 *
 * Changes are applied only through the app (More > Clean the ledger, admin),
 * so every row is audited under the admin's name.
 *
 *   npm run clean:ledger -- 2026-09-15
 */
import "./env";
import { createClient } from "@supabase/supabase-js";
import { loadCleanup, type WeekCount } from "@/lib/ledger/cleanup-server";
import { weekOf } from "@/lib/week";

const BUSINESS = process.env.BUSINESS_ID ?? "00000000-0000-4000-8000-000000000001";

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const week = weekOf(process.argv[2], new Date().toISOString().slice(0, 10));
  const view = await loadCleanup(db, BUSINESS, week);
  const { plan, rows, products } = view;
  const units = (w: WeekCount) =>
    Object.entries(w.units)
      .filter(([, n]) => n !== 0)
      .map(([id, n]) => `${n} ${products.get(id) ?? id}`)
      .join(", ");

  const after: WeekCount = { orders: view.before.orders, units: { ...view.before.units }, cancelled: view.before.cancelled };
  const inWeek = (id: string) => {
    const r = rows.get(id);
    return Boolean(r && r.date >= week.from && r.date <= week.to && r.status === "active");
  };
  const drop = (id: string) => {
    if (!inWeek(id)) return;
    after.orders -= 1;
    for (const i of rows.get(id)!.items) after.units[i.product_id] = (after.units[i.product_id] ?? 0) - i.qty;
  };
  plan.exactDuplicates.forEach((d) => d.remove.forEach(drop));
  plan.merges.forEach((m) => drop(m.remove));
  const cancelled = new Set(plan.cancelBeforeShipping.map((c) => c.id));
  for (const c of plan.cancelBeforeShipping) {
    const r = rows.get(c.id);
    if (r && r.date >= week.from && r.date <= week.to) after.cancelled += 1;
    drop(c.id);
  }
  for (const m of plan.remaps) {
    if (!inWeek(m.id) || cancelled.has(m.id)) continue;
    const q = rows.get(m.id)!.items.reduce((a, i) => a + i.qty, 0);
    after.units[m.from] = (after.units[m.from] ?? 0) - q;
    after.units[m.to] = (after.units[m.to] ?? 0) + q;
  }

  console.log(`Week ${week.from} to ${week.to}; Orders files read: ${view.ordersFiles}`);
  console.log(`Exact duplicates: ${plan.exactDuplicates.map((d) => `#${d.order_ref} x${d.remove.length}`).join(", ") || "none"}`);
  for (const m of plan.merges) {
    const r = rows.get(m.remove)!;
    console.log(`Merge typed ${r.date} qty ${r.quantity} ${r.gross_amount} into #${m.order_ref} (${m.why})`);
  }
  for (const u of plan.unmatched) console.log(`Unmatched typed row, left for review: ${u.date} qty ${u.quantity} ${u.gross_amount} (${u.id})`);
  console.log(`Cancelled before shipping: ${plan.cancelBeforeShipping.length} ${plan.cancelBeforeShipping.map((c) => `#${c.order_ref}`).join(" ")}`);
  console.log(`Moved to their variant: ${plan.remaps.length} (${plan.remaps.map((m) => `${products.get(m.to)}`).join(", ")})`);
  console.log(`BEFORE: ${view.before.orders} live orders; ${units(view.before)}; ${view.before.cancelled} cancelled before shipping`);
  console.log(`AFTER:  ${after.orders} live orders; ${units(after)}; ${after.cancelled} cancelled before shipping`);
})();
