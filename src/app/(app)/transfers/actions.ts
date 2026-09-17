"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordDenied, requireSession } from "@/lib/auth";
import { ledgerChanged } from "@/lib/data/ledger";
import { applyTransferUpdate } from "@/lib/ledger/update";
import { UUID } from "@/lib/soft-delete";
import { kindForReason, PEOPLE, TRANSFER_REASONS } from "@/lib/types";

const TransferSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    from_person: z.enum(PEOPLE),
    to_person: z.enum(PEOPLE),
    amount: z.coerce.number().positive().max(99_999_999),
    reason: z.enum(TRANSFER_REASONS),
    note: z.string().trim().max(2000).optional(),
    redirect_to: z.enum(["/", "/balance", "/investment"]).optional(),
  })
  .refine((v) => v.from_person !== v.to_person, { message: "same person" })
  .refine((v) => v.reason !== "other" || (v.note ?? "").length > 0, { message: "note required for other" });

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
    reason: parsed.data.reason,
    kind: kindForReason(parsed.data.reason),
    note: parsed.data.note ?? "",
  });
  if (error) redirect("/?transfer=save");

  ledgerChanged(profile.business_id);
  redirect(`${parsed.data.redirect_to ?? "/"}?transfer=saved`);
}


export async function updateTransfer(id: string, formData: FormData) {
  const session = await requireSession();
  const { supabase, profile } = session;
  if (!UUID.test(id)) redirect("/");
  const parsed = TransferSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/transfers/${id}/edit?error=invalid`);

  const { date, from_person, to_person, amount, reason, note } = parsed.data;
  const outcome = await applyTransferUpdate(supabase, profile.business_id, id, { date, from_person, to_person, amount, reason, kind: kindForReason(reason), note: note ?? "" });
  if (!outcome.ok) {
    if (outcome.reason === "denied") {
      await recordDenied(session, "internal_transfer", id, { attempted: "update" });
      redirect(`/transfers/${id}/edit?error=denied`);
    }
    redirect(`/transfers/${id}/edit?error=save`);
  }
  ledgerChanged(profile.business_id);
  redirect(`${parsed.data.redirect_to ?? "/"}?transfer=saved`);
}
