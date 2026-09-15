import { z } from "zod";
import { EXPENSE_CATEGORIES, PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, type Transaction } from "@/lib/types";

const money = z.coerce.number().min(0).max(99_999_999);
const quantity = z.coerce.number().int().min(1).max(100_000).default(1);

const IncomeSchema = z.object({
  type: z.literal("income"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  product_line: z.enum(PRODUCT_LINES),
  gross_amount: money,
  net_amount: money.optional(),
  quantity,
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
  quantity,
  payer: z.enum(PEOPLE),
  category: z.enum(EXPENSE_CATEGORIES),
  note: z.string().trim().max(2000).optional(),
});

export const TransactionSchema = z.discriminatedUnion("type", [IncomeSchema, ExpenseSchema]);
export type TransactionInput = z.infer<typeof TransactionSchema>;

export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  if (out.net_amount === "") delete out.net_amount;
  if (out.quantity === "") delete out.quantity;
  return out;
}

export type TransactionInsert = Omit<Transaction, "id" | "created_at">;

/** Maps validated form input onto a transactions row. Expenses store the amount in both gross and net. */
export function toRow(input: TransactionInput, businessId: string): TransactionInsert {
  if (input.type === "income") {
    return {
      business_id: businessId,
      type: "income" as const,
      date: input.date,
      platform: input.platform,
      product_line: input.product_line,
      gross_amount: input.gross_amount,
      net_amount: input.net_amount ?? input.gross_amount,
      quantity: input.quantity,
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
    quantity: input.quantity,
    payer: input.payer,
    received_by: null,
    category: input.category,
    customer_name: null,
    note: input.note ?? "",
  };
}
