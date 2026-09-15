"use server";

import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";

export async function saveCustomerNote(id: string, formData: FormData) {
  const session = await requireSession();
  const { supabase, profile } = session;
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const { data: before } = await supabase.from("customers").select("id, name, note").eq("id", id).eq("business_id", profile.business_id).maybeSingle();
  if (!before || before.note === note) return;
  const { error } = await supabase.from("customers").update({ note }).eq("id", id).eq("business_id", profile.business_id);
  if (error) return;
  await recordAudit(session, { action: "update", entity_type: "customer", entity_id: id, before: { name: before.name, note: before.note }, after: { name: before.name, note } });
  ledgerChanged(profile.business_id);
}
