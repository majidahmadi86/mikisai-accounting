/** Tables that support soft delete and restore. Kept outside the server-action file, which may only export async functions. */
export const SOFT_DELETE_ENTITIES = ["transaction", "payout", "internal_transfer", "customer"] as const;
export type SoftDeleteEntity = (typeof SOFT_DELETE_ENTITIES)[number];

export const SOFT_DELETE_TABLE: Record<SoftDeleteEntity, "transactions" | "payouts" | "internal_transfers" | "customers"> = {
  transaction: "transactions",
  payout: "payouts",
  internal_transfer: "internal_transfers",
  customer: "customers",
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSoftDeleteTarget(entity: unknown, id: unknown): entity is SoftDeleteEntity {
  return typeof entity === "string" && (SOFT_DELETE_ENTITIES as readonly string[]).includes(entity) && typeof id === "string" && UUID.test(id);
}
