"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { PEOPLE, TRANSFER_KINDS } from "@/lib/types";

const TransferSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    from_person: z.enum(PEOPLE),
    to_person: z.enum(PEOPLE),
    amount: z.coerce.number().positive().max(99_999_999),
    kind: z.enum(TRANSFER_KINDS).default("settlement"),
    note: z.string().trim().max(2000).optional(),
    redirect_to: z.enum(["/", "/balance"]).optional(),
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
    kind: parsed.data.kind,
    note: parsed.data.note ?? "",
  });
  if (error) redirect("/?transfer=save");

  ledgerChanged(profile.business_id);
  redirect(`${parsed.data.redirect_to ?? "/"}?transfer=saved`);
}

