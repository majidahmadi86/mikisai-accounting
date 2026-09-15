"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
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
  const { supabase, profile } = await requireSession();
  const parsed = TransferSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/?transfer=invalid");

  const { error } = await supabase.from("internal_transfers").insert({
    business_id: profile.business_id,
    date: parsed.data.date,
    from_person: parsed.data.from_person,
    to_person: parsed.data.to_person,
    amount: parsed.data.amount,
    note: parsed.data.note ?? "",
  });
  if (error) redirect("/?transfer=save");

  revalidatePath("/");
  redirect("/");
}

export async function deleteTransfer(id: string) {
  const { supabase, profile } = await requireSession();
  await supabase.from("internal_transfers").delete().eq("id", id).eq("business_id", profile.business_id);
  revalidatePath("/");
  redirect("/");
}
