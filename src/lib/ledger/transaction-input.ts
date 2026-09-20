import { z } from "zod";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES, type Transaction } from "@/lib/types";
import { noteWithNoOrderRef, orderRefProblem } from "./order-ref";

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
  /** The platform order number; one per platform, checked on save. */
  order_ref: z.string().trim().max(100).optional(),
  /** "No order ID" was switched on: why this sale has none. Required when order_ref is empty. */
  no_order_ref_reason: z.string().trim().max(300).optional(),
  /** Admin only: why a duplicate order number is being saved anyway. */
  override_reason: z.string().trim().max(300).optional(),
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

export const TransactionSchema = z.discriminatedUnion("type", [IncomeSchema, ExpenseSchema]).superRefine((input, ctx) => {
  // A sale needs its order ID, or an explicit "No order ID" with a reason.
  if (input.type === "income" && orderRefProblem(input.order_ref, input.no_order_ref_reason)) ctx.addIssue({ code: "custom", path: ["order_ref"], message: "order_ref_required" });
});

/** True when validation failed only because the sale has neither an order ID nor a reason for having none. */
export function isOrderRefIssue(error: z.ZodError): boolean {
  return error.issues.some((i) => i.path[0] === "order_ref");
}
export type TransactionInput = z.infer<typeof TransactionSchema>;

export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  if (out.net_amount === "") delete out.net_amount;
  if (out.quantity === "") delete out.quantity;
  if (out.order_ref === "") delete out.order_ref;
  if (out.no_order_ref_reason === "") delete out.no_order_ref_reason;
  if (out.override_reason === "") delete out.override_reason;
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

/** Columns a form may write. The order status has its own path (mark_order_status) so an edit never resets it. */
export type TransactionInsert = Omit<Transaction, "id" | "created_at" | "created_by" | "deleted_at" | "deleted_by" | "status" | "status_date" | "status_reason" | "refund_amount" | "tags">;

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
      order_ref: input.order_ref ? input.order_ref : null,
      note: noteWithNoOrderRef(input.note, input.order_ref ? null : input.no_order_ref_reason),
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
    order_ref: null,
    note: input.note ?? "",
  };
}
