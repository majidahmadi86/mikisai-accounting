export const PLATFORMS = ["tiktok", "shopee", "fb", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PRODUCT_LINES = ["sugar", "skincare", "other"] as const;
export type ProductLine = (typeof PRODUCT_LINES)[number];

export const PEOPLE = ["mike", "sai"] as const;
export type Person = (typeof PEOPLE)[number];

export const SETTLEMENT_STATUSES = ["pending", "settled_not_withdrawn", "received_in_bank"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const TRANSACTION_TYPES = ["income", "expense"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ROLES = ["admin", "contributor"] as const;
export type Role = (typeof ROLES)[number];

export const TRANSFER_KINDS = ["settlement", "capital"] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

export const TRANSFER_REASONS = ["stock_purchase", "samples", "profit_settlement", "expense_reimbursement", "other"] as const;
export type TransferReason = (typeof TRANSFER_REASONS)[number];

/** The database derives kind from reason with the same rule; kept here for forms and tests. */
export function kindForReason(reason: TransferReason): TransferKind {
  return reason === "profit_settlement" ? "settlement" : "capital";
}

export type Business = { id: string; name: string; exposure_limit: number };

export type Profile = {
  id: string;
  business_id: string;
  display_name: "Mike" | "Sai";
  role: Role;
};

/** Columns shared by every soft-deletable row. */
export type Ownership = {
  created_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

export type Transaction = {
  id: string;
  business_id: string;
  type: TransactionType;
  date: string;
  platform: Platform;
  product_line: ProductLine;
  gross_amount: number;
  net_amount: number;
  payer: Person | null;
  received_by: Person | null;
  category_id: string | null;
  customer_name: string | null;
  note: string;
  quantity: number;
  created_at: string;
} & Ownership;

export type Settlement = {
  id: string;
  business_id: string;
  transaction_id: string;
  status: SettlementStatus;
  /** Part of the order already in the bank while the rest stays pending (early payout). */
  paid_amount: number;
  settled_at: string | null;
  payout_id: string | null;
  created_at: string;
};

export type Payout = {
  id: string;
  business_id: string;
  date: string;
  platform: Platform;
  amount_received: number;
  received_by: Person;
  note: string;
  created_at: string;
} & Ownership;

export type InternalTransfer = {
  id: string;
  business_id: string;
  date: string;
  from_person: Person;
  to_person: Person;
  amount: number;
  kind: TransferKind;
  reason: TransferReason;
  note: string;
  created_at: string;
} & Ownership;

export type Customer = {
  id: string;
  business_id: string;
  name: string;
  platform: Platform;
  note: string;
  created_at: string;
} & Ownership;

export type PlatformSetting = {
  business_id: string;
  platform: Platform;
  commission_pct: number;
  fixed_fee: number;
  /** Days the platform usually takes from order to bank. */
  settlement_lag_days: number;
  /** Share of each order paid on day zero when the platform's early-payout feature is on; 100 means no early payout. */
  daily_payout_pct: number;
};

export const AUDIT_ACTIONS = ["create", "update", "delete", "soft_delete", "restore", "denied", "confirm_import", "confirm_payout", "export"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = ["transaction", "settlement", "payout", "internal_transfer", "customer", "platform_setting", "business", "expense_category", "product", "stock_movement", "transaction_item", "report_upload", "report"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export type AuditLog = {
  id: string;
  business_id: string;
  actor_user_id: string | null;
  action: AuditAction;
  entity_type: AuditEntity;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

export type ReportUpload = {
  id: string;
  business_id: string;
  platform: Platform;
  file_url: string;
  uploaded_at: string;
  parsed: boolean;
  parse_result: unknown;
};

/** Supabase returns numeric columns as strings. Normalise once at the edge. */
export function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function personLabel(p: Person | null | undefined): string {
  return p === "mike" ? "Mike" : p === "sai" ? "Sai" : "";
}

export function otherPerson(p: Person): Person {
  return p === "mike" ? "sai" : "mike";
}
