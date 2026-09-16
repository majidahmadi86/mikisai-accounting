import { z } from "zod";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, type Transaction } from "@/lib/types";

const money = z.coerce.number().min(0).max(99_999_999);

export const ItemSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(100_000),
  unit_price: z.coerce.number().min(0).max(99_999_999).optional(),
  unit_cost: z.coerce.number().min(0).max(99_999_999).optional(),
});
export type ItemInput = z.infer<typeof ItemSchema>;
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
  /** A sale always names what was sold. */
  items: z.array(ItemSchema).min(1).max(50),
});

const ExpenseSchema = z.object({
  type: z.literal("expense"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  product_line: z.enum(PRODUCT_LINES),
  amount: money,
  quantity,
  payer: z.enum(PEOPLE),
  category_id: z.string().uuid(),
  note: z.string().trim().max(2000).optional(),
  /** Required when the category moves stock (purchase or samples). */
  items: z.array(ItemSchema).max(50).optional(),
});

export const TransactionSchema = z.discriminatedUnion("type", [IncomeSchema, ExpenseSchema]);
export type TransactionInput = z.infer<typeof TransactionSchema>;

export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  if (out.net_amount === "") delete out.net_amount;
  if (out.quantity === "") delete out.quantity;
  // The items editor posts its lines as JSON in one hidden field.
  if (typeof out.items === "string") {
    try {
      out.items = JSON.parse(out.items);
    } catch {
      delete out.items;
    }
  }
  return out;
}

export type TransactionInsert = Omit<Transaction, "id" | "created_at" | "created_by" | "deleted_at" | "deleted_by">;

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
      category_id: null,
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
    category_id: input.category_id,
    customer_name: null,
    note: input.note ?? "",
  };
}
