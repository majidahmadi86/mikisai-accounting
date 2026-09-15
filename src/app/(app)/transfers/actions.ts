"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { PEOPLE } from "@/lib/types";

const TransferSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    from_person: z.enum(PEOPLE),
    to_person: z.enum(PEOPLE),
    amount: z.coerce.number().positive().max(99_999_999),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.from_person !== v.to_person, { message: "same person" });

export async function createTransfer(formData: FormData) {
  const session = await requireSession();
  const { supabase, profile } = session;
  const parsed = TransferSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/?transfer=invalid");

  const { data, error } = await supabase
    .from("internal_transfers")
    .insert({
      business_id: profile.business_id,
      date: parsed.data.date,
      from_person: parsed.data.from_person,
      to_person: parsed.data.to_person,
      amount: parsed.data.amount,
      note: parsed.data.note ?? "",
    })
    .select("*")
    .single();
  if (error || !data) redirect("/?transfer=save");

  await recordAudit(session, { action: "create", entity_type: "internal_transfer", entity_id: data.id, after: data });
  ledgerChanged(profile.business_id);
  redirect("/");
}

export async function deleteTransfer(id: string) {
  const session = await requireSession();
  const { supabase, profile } = session;
  const { data: before } = await supabase.from("internal_transfers").select("*").eq("id", id).eq("business_id", profile.business_id).maybeSingle();
  if (before) {
    await supabase.from("internal_transfers").delete().eq("id", id).eq("business_id", profile.business_id);
    await recordAudit(session, { action: "delete", entity_type: "internal_transfer", entity_id: id, before });
    ledgerChanged(profile.business_id);
  }
  redirect("/");
}
