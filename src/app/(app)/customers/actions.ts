"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";

export async function saveCustomerNote(id: string, formData: FormData) {
  const { supabase, profile } = await requireSession();
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  await supabase.from("customers").update({ note }).eq("id", id).eq("business_id", profile.business_id);
  revalidatePath("/customers");
}
