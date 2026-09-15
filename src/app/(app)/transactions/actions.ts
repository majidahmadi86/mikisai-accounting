"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { EXPENSE_CATEGORIES, PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, type Transaction } from "@/lib/types";

const money = z.coerce.number().min(0).max(99_999_999);

const IncomeSchema = z.object({
  type: z.literal("income"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  product_line: z.enum(PRODUCT_LINES),
  gross_amount: money,
  net_amount: money.optional(),
  received_by: z.enum(PEOPLE),
  customer_name: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  settlement_status: z.enum(SETTLEMENT_STATUSES).optional(),
});

const ExpenseSchema = z.object({
  type: z.literal("expense"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  product_line: z.enum(PRODUCT_LINES),
  amount: money,
  payer: z.enum(PEOPLE),
  category: z.enum(EXPENSE_CATEGORIES),
  note: z.string().trim().max(2000).optional(),
});

const TransactionSchema = z.discriminatedUnion("type", [IncomeSchema, ExpenseSchema]);

function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  if (out.net_amount === "") delete out.net_amount;
  return out;
}

type TransactionInsert = Omit<Transaction, "id" | "created_at">;

function toRow(input: z.infer<typeof TransactionSchema>, businessId: string): TransactionInsert {
  if (input.type === "income") {
    return {
      business_id: businessId,
      type: "income" as const,
      date: input.date,
      platform: input.platform,
      product_line: input.product_line,
      gross_amount: input.gross_amount,
      net_amount: input.net_amount ?? input.gross_amount,
      received_by: input.received_by,
      payer: null,
      category: null,
      customer_name: input.customer_name ? input.customer_name : null,
      note: input.note ?? "",
    };
  }
  return {
    business_id: businessId,
    type: "expense" as const,
    date: input.date,
    platform: input.platform,
    product_line: input.product_line,
    gross_amount: input.amount,
    net_amount: input.amount,
    payer: input.payer,
    received_by: null,
    category: input.category,
    customer_name: null,
    note: input.note ?? "",
  };
}

export async function createTransaction(formData: FormData) {
  const { supabase, profile } = await requireSession();
  const parsed = TransactionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/transactions/new?type=${formData.get("type") ?? "income"}&error=invalid`);

  const row = toRow(parsed.data, profile.business_id);
  const { data, error } = await supabase.from("transactions").insert(row).select("id").single();
  if (error || !data) redirect(`/transactions/new?type=${row.type}&error=save`);

  if (row.type === "income") {
    // Adding income always creates a pending settlement.
    const { error: sErr } = await supabase.from("settlements").insert({
      business_id: profile.business_id,
      transaction_id: data.id,
      status: "pending",
    });
    if (sErr) {
      await supabase.from("transactions").delete().eq("id", data.id);
      redirect(`/transactions/new?type=income&error=save`);
    }
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/customers");
  redirect("/transactions");
}

export async function updateTransaction(id: string, formData: FormData) {
  const { supabase, profile } = await requireSession();
  const parsed = TransactionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/transactions/${id}/edit?error=invalid`);

  const row = toRow(parsed.data, profile.business_id);
  const { error } = await supabase.from("transactions").update(row).eq("id", id).eq("business_id", profile.business_id);
  if (error) redirect(`/transactions/${id}/edit?error=save`);

  if (parsed.data.type === "income" && parsed.data.settlement_status) {
    const status = parsed.data.settlement_status;
    const { data: existing } = await supabase.from("settlements").select("id, status").eq("transaction_id", id).maybeSingle();
    if (existing) {
      if (existing.status !== status) {
        await supabase
          .from("settlements")
          .update({ status, settled_at: status === "received_in_bank" ? new Date().toISOString() : null, payout_id: status === "received_in_bank" ? undefined : null })
          .eq("id", existing.id);
      }
    } else {
      await supabase.from("settlements").insert({ business_id: profile.business_id, transaction_id: id, status });
    }
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/customers");
  revalidatePath("/payouts");
  redirect("/transactions");
}

export async function deleteTransaction(id: string) {
  const { supabase, profile } = await requireSession();
  await supabase.from("transactions").delete().eq("id", id).eq("business_id", profile.business_id);
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/customers");
  revalidatePath("/payouts");
  redirect("/transactions");
}
