/**
 * Seeds the two founder accounts and a small set of sample data.
 *
 *   npm run seed            create users + profiles, insert sample data if the ledger is empty
 *   npm run seed -- --reset also wipe existing transactions, payouts and transfers first
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY. Never run against production with --reset.
 */
import { createClient } from "@supabase/supabase-js";
import { computeBalance } from "../src/lib/balance";
import { EXPECTED_AFTER_PAYOUT, SEED_BUSINESS_ID, SEED_PAYOUT, SEED_TRANSACTIONS, SEED_TRANSFER } from "../src/lib/fixtures/seed-data";
import { thb } from "../src/lib/money";
import { requireEnv } from "./env";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const reset = process.argv.includes("--reset");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function ensureUser(email: string, password: string, displayName: "Mike" | "Sai"): Promise<string> {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
    if (error) throw error;
    user = data.user;
    console.log(`created user ${email}`);
  } else {
    console.log(`user exists ${email}`);
  }
  const { error: pErr } = await admin.from("profiles").upsert({ id: user.id, business_id: SEED_BUSINESS_ID, display_name: displayName, role: displayName === "Mike" ? "admin" : "contributor" });
  if (pErr) throw pErr;
  return user.id;
}

async function main() {
  const { data: business } = await admin.from("businesses").select("id").eq("id", SEED_BUSINESS_ID).maybeSingle();
  if (!business) {
    const { error } = await admin.from("businesses").insert({ id: SEED_BUSINESS_ID, name: "MikiSai" });
    if (error) throw error;
  }

  await ensureUser(requireEnv("SEED_MIKE_EMAIL"), requireEnv("SEED_MIKE_PASSWORD"), "Mike");
  await ensureUser(requireEnv("SEED_SAI_EMAIL"), requireEnv("SEED_SAI_PASSWORD"), "Sai");

  if (reset) {
    for (const table of ["settlements", "payouts", "internal_transfers", "transactions", "customers", "report_uploads"]) {
      const { error } = await admin.from(table).delete().eq("business_id", SEED_BUSINESS_ID);
      if (error) throw error;
    }
    console.log("wiped existing ledger rows");
  }

  const { count } = await admin.from("transactions").select("id", { count: "exact", head: true }).eq("business_id", SEED_BUSINESS_ID);
  if ((count ?? 0) > 0) {
    console.log(`ledger already has ${count} transactions, skipping sample data (use --reset to replace)`);
    return;
  }

  // Transactions + settlements
  const idByRef = new Map<string, string>();
  for (const t of SEED_TRANSACTIONS) {
    const { data, error } = await admin
      .from("transactions")
      .insert({
        business_id: SEED_BUSINESS_ID,
        type: t.type,
        date: t.date,
        platform: t.platform,
        product_line: t.product_line,
        gross_amount: t.gross_amount,
        net_amount: t.net_amount,
        received_by: t.received_by,
        payer: t.payer,
        category_id: t.category_id,
        customer_name: t.customer_name,
        note: t.note,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    idByRef.set(t.ref, data.id);
    if (t.type === "income") {
      const status = SEED_PAYOUT.matches.includes(t.ref) ? "pending" : t.status_after_payout ?? "pending";
      const { error: sErr } = await admin.from("settlements").insert({
        business_id: SEED_BUSINESS_ID,
        transaction_id: data.id,
        status,
        settled_at: status === "received_in_bank" ? new Date().toISOString() : null,
      });
      if (sErr) throw sErr;
    }
  }

  // Payout, reconciled against tt1 + tt2 exactly like the UI would.
  const { data: payout, error: pErr } = await admin
    .from("payouts")
    .insert({ business_id: SEED_BUSINESS_ID, date: SEED_PAYOUT.date, platform: SEED_PAYOUT.platform, amount_received: SEED_PAYOUT.amount_received, received_by: SEED_PAYOUT.received_by, note: SEED_PAYOUT.note })
    .select("id")
    .single();
  if (pErr || !payout) throw pErr ?? new Error("payout insert failed");
  const matchedTx = SEED_PAYOUT.matches.map((ref) => idByRef.get(ref)!);
  const { error: mErr } = await admin
    .from("settlements")
    .update({ status: "received_in_bank", settled_at: new Date().toISOString(), payout_id: payout.id })
    .in("transaction_id", matchedTx);
  if (mErr) throw mErr;

  // Internal transfer
  const { error: tErr } = await admin.from("internal_transfers").insert({ business_id: SEED_BUSINESS_ID, ...SEED_TRANSFER });
  if (tErr) throw tErr;

  // Read back through the same shape the dashboard uses and compare with the hand calculation.
  const { data: txRows } = await admin.from("transactions").select("type, platform, net_amount, payer, received_by, settlements(status)").eq("business_id", SEED_BUSINESS_ID);
  const { data: trRows } = await admin.from("internal_transfers").select("from_person, to_person, amount").eq("business_id", SEED_BUSINESS_ID);
  const balance = computeBalance(
    (txRows ?? []).map((r) => {
      const s = Array.isArray(r.settlements) ? r.settlements[0] : r.settlements;
      return { type: r.type, platform: r.platform, net_amount: Number(r.net_amount), payer: r.payer, received_by: r.received_by, settlement_status: s?.status ?? null };
    }),
    (trRows ?? []).map((r) => ({ from_person: r.from_person, to_person: r.to_person, amount: Number(r.amount) })),
  );

  const banner = balance.owes ? `${balance.owes.from} owes ${balance.owes.to} ${thb(balance.owes.amount)}` : "Balanced";
  console.log("\nDashboard after seed:");
  console.log(`  ${banner}`);
  console.log(`  income in bank ${thb(balance.settledIncome)} · expenses ${thb(balance.expenses)} · net ${thb(balance.netProfit)} · share ${thb(balance.target)}`);
  console.log(`  Mike holds ${thb(balance.holdings.mike)} · Sai holds ${thb(balance.holdings.sai)} · pending ${thb(balance.pendingTotal)}`);

  const ok =
    balance.owes?.from === EXPECTED_AFTER_PAYOUT.owes.from &&
    balance.owes?.amount === EXPECTED_AFTER_PAYOUT.owes.amount &&
    balance.netProfit === EXPECTED_AFTER_PAYOUT.netProfit &&
    balance.pendingTotal === EXPECTED_AFTER_PAYOUT.pendingTotal;
  console.log(ok ? "\nPASS: matches hand calculation (Mike owes Sai ฿171.50)" : "\nFAIL: does not match hand calculation");
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
