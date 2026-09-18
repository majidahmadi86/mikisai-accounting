import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tiktokConfig } from "./config";
import type { SyncLogRow, TiktokStatus } from "./status";

/**
 * The connection as the app may show it. Read with the service role (the
 * table has no user policies) and scoped by business; only the columns below
 * are selected, never the token columns.
 */
export async function loadTiktokStatus(admin: SupabaseClient, businessId: string): Promise<TiktokStatus> {
  const configured = Boolean(tiktokConfig()) && Boolean(process.env.TIKTOK_TOKEN_KEY?.trim());
  const [{ data: conn }, { data: logs }, { count }] = await Promise.all([
    admin.from("tiktok_connections").select("status, seller_name, shop_name, connected_at, last_sync_at, refresh_expires_at, last_error").eq("business_id", businessId).maybeSingle(),
    admin.from("sync_log").select("id, trigger, started_at, finished_at, status, orders_new, orders_updated, cancellations, refunds, payouts, queued, error").eq("business_id", businessId).neq("status", "running").order("started_at", { ascending: false }).limit(1),
    admin.from("sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "pending"),
  ]);
  const connected = Boolean(conn) && conn!.status !== "disconnected";
  const state: TiktokStatus["state"] = !configured && !connected ? "not_configured" : !connected ? "not_connected" : conn!.status === "expired" ? "expired" : conn!.status === "error" ? "error" : "connected";
  return {
    configured,
    connected,
    state,
    seller_name: (conn?.seller_name as string | null) ?? null,
    shop_name: (conn?.shop_name as string | null) ?? null,
    connected_at: (conn?.connected_at as string | null) ?? null,
    last_sync_at: (conn?.last_sync_at as string | null) ?? null,
    refresh_expires_at: (conn?.refresh_expires_at as string | null) ?? null,
    last_error: (conn?.last_error as string | null) ?? "",
    last_log: ((logs ?? [])[0] as SyncLogRow | undefined) ?? null,
    queued: count ?? 0,
  };
}

export async function recentSyncLog(admin: SupabaseClient, businessId: string, limit = 20): Promise<SyncLogRow[]> {
  const { data } = await admin.from("sync_log").select("id, trigger, started_at, finished_at, status, orders_new, orders_updated, cancellations, refunds, payouts, queued, error").eq("business_id", businessId).order("started_at", { ascending: false }).limit(limit);
  return (data ?? []) as SyncLogRow[];
}
