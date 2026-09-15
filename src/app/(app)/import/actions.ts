"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES } from "@/lib/types";

const money = z.coerce.number().min(0).max(99_999_999);

const CommitRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  product_line: z.enum(PRODUCT_LINES),
  gross_amount: money,
  net_amount: money,
  received_by: z.enum(PEOPLE),
  status: z.enum(SETTLEMENT_STATUSES),
  customer_name: z.string().trim().max(200).nullable(),
  order_id: z.string().trim().max(100).nullable(),
  note: z.string().trim().max(2000).nullable(),
});

export type CommitRow = z.infer<typeof CommitRowSchema>;

const CommitSchema = z.object({
  rows: z.array(CommitRowSchema).min(1).max(500),
  upload_ids: z.array(z.string().uuid()).max(50),
});

export type CommitResult = { ok: true; inserted: number } | { ok: false; error: string };

/**
 * The only path from AI extraction into the ledger. Runs after the user has
 * reviewed and confirmed rows, never automatically.
 */
export async function commitImport(input: unknown): Promise<CommitResult> {
  const { supabase, profile } = await requireSession();
  const parsed = CommitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const rows = parsed.data.rows.map((r) => ({
    business_id: profile.business_id,
    type: "income" as const,
    date: r.date,
    platform: r.platform,
    product_line: r.product_line,
    gross_amount: r.gross_amount,
    net_amount: r.net_amount,
    received_by: r.received_by,
    payer: null,
    category: null,
    customer_name: r.customer_name || null,
    note: [r.order_id ? `#${r.order_id}` : "", r.note ?? ""].filter(Boolean).join(" · "),
  }));

  const { data: inserted, error } = await supabase.from("transactions").insert(rows).select("id");
  if (error || !inserted) return { ok: false, error: "save" };

  const settlements = inserted.map((tx, i) => ({
    business_id: profile.business_id,
    transaction_id: tx.id,
    status: parsed.data.rows[i].status,
    settled_at: parsed.data.rows[i].status === "received_in_bank" ? new Date().toISOString() : null,
  }));
  const { error: sErr } = await supabase.from("settlements").insert(settlements);
  if (sErr) {
    await supabase.from("transactions").delete().in("id", inserted.map((t) => t.id));
    return { ok: false, error: "save" };
  }

  if (parsed.data.upload_ids.length) {
    await supabase.from("report_uploads").update({ parsed: true }).in("id", parsed.data.upload_ids).eq("business_id", profile.business_id);
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/customers");
  revalidatePath("/payouts");
  return { ok: true, inserted: inserted.length };
}
