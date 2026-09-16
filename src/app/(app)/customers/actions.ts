"use server";

import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";

export async function saveCustomerNote(id: string, formData: FormData) {
  const { supabase, profile } = await requireSession();
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const { error, count } = await supabase.from("customers").update({ note }, { count: "exact" }).eq("id", id).eq("business_id", profile.business_id);
  if (error || !count) return;
  ledgerChanged(profile.business_id);
}
