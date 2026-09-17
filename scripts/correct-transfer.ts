/**
 * Data correction through the normal update path (v2.7): the Mike → Sai
 * ฿2,005 transfer of 16 Sept 2026 was recorded as "profit share" while its
 * note says it paid for samples and product. Signs in as the admin, updates
 * the row through applyTransferUpdate (row level security and the audit
 * trigger apply), records a system-correction audit entry with before and
 * after, and prints the row before and after.
 *
 *   npx tsx scripts/correct-transfer.ts            # print the row, no change
 *   npx tsx scripts/correct-transfer.ts -- --apply  # apply the correction
 */
import { createClient } from "@supabase/supabase-js";
import { SEED_BUSINESS_ID } from "../src/lib/fixtures/seed-data";
import { applyTransferUpdate } from "../src/lib/ledger/update";
import { kindForReason, type Person, type TransferReason } from "../src/lib/types";
import { requireEnv } from "./env";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const email = requireEnv("SEED_MIKE_EMAIL");
const password = requireEnv("SEED_MIKE_PASSWORD");
const apply = process.argv.includes("--apply");
const NEW_REASON: TransferReason = "my_half_of_costs";

async function main() {
  const mike = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await mike.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: rows, error } = await mike
    .from("internal_transfers")
    .select("id, date, from_person, to_person, amount, reason, kind, note, updated_by, updated_at")
    .eq("business_id", SEED_BUSINESS_ID)
    .eq("date", "2026-09-16")
    .eq("from_person", "mike")
    .eq("to_person", "sai")
    .is("deleted_at", null);
  if (error) throw error;
  const row = (rows ?? []).find((r) => Number(r.amount) === 2005);
  if (!row) {
    console.log("No Mike → Sai ฿2,005 transfer dated 2026-09-16 found.");
    return;
  }
  console.log("BEFORE", JSON.stringify(row));
  if (row.reason === NEW_REASON && !process.argv.includes("--note")) {
    console.log("Already corrected.");
    return;
  }
  if (!apply) {
    console.log("Dry run. Pass --apply to change the reason to", NEW_REASON);
    return;
  }

  const changed = row.reason !== NEW_REASON;
  if (changed) {
    const outcome = await applyTransferUpdate(mike, SEED_BUSINESS_ID, row.id, {
      date: row.date,
      from_person: row.from_person as Person,
      to_person: row.to_person as Person,
      amount: Number(row.amount),
      reason: NEW_REASON,
      kind: kindForReason(NEW_REASON),
      note: row.note ?? "",
    });
    if (!outcome.ok) throw new Error(`update refused: ${outcome.reason} ${outcome.message ?? ""}`);
  } else {
    console.log("Reason already my_half_of_costs; no row change.");
  }

  if (changed || process.argv.includes("--note")) {
    const { error: noteError } = await mike.rpc("record_action", {
      p_action: "update",
      p_entity_type: "system_correction",
      p_entity_id: row.id,
      p_before: { entity: "internal_transfer", reason: row.reason, kind: row.kind },
      p_after: { entity: "internal_transfer", reason: NEW_REASON, kind: kindForReason(NEW_REASON), why: "v2.7: the note says this paid for samples and product, so it is my half of a cost the other paid, not a profit share" },
    });
    if (noteError) throw new Error(`system correction not recorded: ${noteError.message}`);
    console.log("Audit: system_correction row written.");
  }

  const { data: after } = await mike.from("internal_transfers").select("id, date, from_person, to_person, amount, reason, kind, note, updated_by, updated_at").eq("id", row.id).single();
  console.log("AFTER ", JSON.stringify(after));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
