import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitRows, type AuditEntry } from "@/lib/import/commit";
import { existingOrders, importContext } from "@/lib/import/server";
import { todayIso } from "@/lib/money";
import type { Person } from "@/lib/types";
import { refreshAccessToken, TikTokApiError, TikTokClient, type TikTokConfig } from "./client";
import { decryptSecret, encryptSecret } from "./crypto";
import { mapOrder, mapPayment, mapReturn, mapStatementTransactions, type SyncedOrder, type SyncedPayment, type SyncedReturn } from "./map";
import { planSync } from "./plan";
import { tiktokConfig } from "./config";

export type SyncTrigger = "cron" | "webhook" | "manual";
export type SyncSummary = { status: "ok" | "error" | "skipped"; orders_new: number; orders_updated: number; cancellations: number; refunds: number; payouts: number; queued: number; error: string; log_id: string | null };

const OVERLAP_SECONDS = 3600;
const FIRST_WINDOW_DAYS = 30;
const REFRESH_AHEAD_SECONDS = 15 * 60;

export { tiktokConfig } from "./config";

type ConnectionRow = {
  business_id: string;
  shop_cipher: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  access_expires_at: string;
  refresh_expires_at: string;
  status: string;
  orders_cursor: string | null;
  finance_cursor: string | null;
  connected_by: string | null;
  connected_at: string;
};

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * One sync for one business. The poll is the source of truth: it asks for
 * everything updated since the last cursor (with an hour of overlap), so a
 * missed webhook or a failed run loses nothing. Rows with an order number, a
 * quantity, a matched product and the amount TikTok settles go straight into
 * the ledger; anything less waits in sync_queue for the review table.
 * Cancellations and refunds are applied through mark_order_status, payouts
 * are matched oldest first, and every run ends in a sync_log row.
 */
export async function runTiktokSync(db: SupabaseClient, businessId: string, trigger: SyncTrigger, opts: { config?: TikTokConfig | null; now?: () => number; details?: Record<string, unknown> } = {}): Promise<SyncSummary> {
  const now = opts.now ?? Date.now;
  const summary: SyncSummary = { status: "ok", orders_new: 0, orders_updated: 0, cancellations: 0, refunds: 0, payouts: 0, queued: 0, error: "", log_id: null };
  const { data: log } = await db.from("sync_log").insert({ business_id: businessId, trigger, details: opts.details ?? {} }).select("id").single();
  summary.log_id = (log?.id as string | undefined) ?? null;

  const finish = async (patch: Partial<SyncSummary>, details: Record<string, unknown> = {}) => {
    Object.assign(summary, patch);
    if (summary.log_id) {
      await db
        .from("sync_log")
        .update({ finished_at: new Date(now()).toISOString(), status: summary.status, orders_new: summary.orders_new, orders_updated: summary.orders_updated, cancellations: summary.cancellations, refunds: summary.refunds, payouts: summary.payouts, queued: summary.queued, error: summary.error, details: { ...(opts.details ?? {}), ...details } })
        .eq("id", summary.log_id);
    }
    return summary;
  };

  const config = opts.config === undefined ? tiktokConfig() : opts.config;
  if (!config) return finish({ status: "skipped", error: "app_not_configured" });
  const { data: conn } = await db.from("tiktok_connections").select("*").eq("business_id", businessId).maybeSingle();
  const connection = conn as ConnectionRow | null;
  if (!connection || connection.status === "disconnected") return finish({ status: "skipped", error: "not_connected" });

  try {
    // Token: refresh ahead of expiry; a failure is loud (Data health reads it) and stops the run.
    let accessToken = decryptSecret(connection.access_token_enc);
    if (unix(connection.access_expires_at) - Math.floor(now() / 1000) < REFRESH_AHEAD_SECONDS) {
      try {
        const fresh = await refreshAccessToken(config, decryptSecret(connection.refresh_token_enc));
        accessToken = fresh.accessToken;
        await db
          .from("tiktok_connections")
          .update({ access_token_enc: encryptSecret(fresh.accessToken), refresh_token_enc: encryptSecret(fresh.refreshToken), access_expires_at: new Date(fresh.accessExpiresAt * 1000).toISOString(), refresh_expires_at: new Date(fresh.refreshExpiresAt * 1000).toISOString(), status: "connected", last_error: "", updated_at: new Date(now()).toISOString() })
          .eq("business_id", businessId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "refresh failed";
        await db.from("tiktok_connections").update({ status: "expired", last_error: `token_refresh_failed: ${message}`, updated_at: new Date(now()).toISOString() }).eq("business_id", businessId);
        return finish({ status: "error", error: `token_refresh_failed: ${message}` });
      }
    }

    const client = new TikTokClient(config, { accessToken, shopCipher: connection.shop_cipher ?? undefined });
    const firstWindow = unix(connection.connected_at) - FIRST_WINDOW_DAYS * 86400;
    const ordersSince = (connection.orders_cursor ? unix(connection.orders_cursor) : firstWindow) - OVERLAP_SECONDS;
    const financeSince = (connection.finance_cursor ? unix(connection.finance_cursor) : firstWindow) - OVERLAP_SECONDS;

    const orders: SyncedOrder[] = [];
    let maxUpdate = connection.orders_cursor ? unix(connection.orders_cursor) : 0;
    for await (const o of client.searchOrders({ updateTimeGe: ordersSince })) {
      const mapped = mapOrder(o);
      orders.push(mapped);
      if (mapped.updated_at > maxUpdate) maxUpdate = mapped.updated_at;
    }
    const returns: SyncedReturn[] = [];
    for await (const r of client.searchReturns({ updateTimeGe: ordersSince })) {
      const mapped = mapReturn(r);
      if (mapped) returns.push(mapped);
    }
    const settlements = new Map<string, number>();
    let maxStatement = connection.finance_cursor ? unix(connection.finance_cursor) : 0;
    for await (const s of client.searchStatements({ statementTimeGe: financeSince })) {
      if (s.statement_time > maxStatement) maxStatement = s.statement_time;
      for (const [ref, value] of mapStatementTransactions(await client.getStatementTransactions(s.id))) settlements.set(ref, value);
    }
    const payments: SyncedPayment[] = [];
    for await (const p of client.searchPayments({ createTimeGe: financeSince })) {
      const mapped = mapPayment(p);
      if (mapped) payments.push(mapped);
    }

    const ctx = await importContext(db, businessId);
    const refs = [...orders.map((o) => o.order_ref), ...returns.map((r) => r.order_ref)];
    const existing = await existingOrders(db, businessId, "tiktok", refs);
    // The shop is Sai's: its payouts land in her account unless the business says otherwise.
    const receivedBy: Person = "sai";
    const plan = planSync({ orders, returns, settlements, payments, ctx, existing, receivedBy, today: todayIso() });

    // Orders waiting in the queue that this run could now settle leave the queue; the rest are upserted.
    const autoRefs = plan.auto.map((r) => r.order_id as string);
    if (autoRefs.length) await db.from("sync_queue").update({ status: "confirmed", updated_at: new Date(now()).toISOString() }).eq("business_id", businessId).eq("platform", "tiktok").eq("status", "pending").in("order_ref", autoRefs);
    for (const q of plan.queue) {
      const { data: pending } = await db.from("sync_queue").select("id").eq("business_id", businessId).eq("platform", "tiktok").eq("order_ref", q.order_ref).eq("status", "pending").maybeSingle();
      if (pending) await db.from("sync_queue").update({ row: q.row, reasons: q.reasons, updated_at: new Date(now()).toISOString() }).eq("id", pending.id);
      else {
        const { data: dismissed } = await db.from("sync_queue").select("id").eq("business_id", businessId).eq("platform", "tiktok").eq("order_ref", q.order_ref).eq("status", "dismissed").limit(1).maybeSingle();
        if (!dismissed) await db.from("sync_queue").insert({ business_id: businessId, platform: "tiktok", order_ref: q.order_ref, row: q.row, reasons: q.reasons });
      }
    }

    const audit = async (entry: AuditEntry) => {
      await db.from("audit_log").insert({ business_id: businessId, actor_user_id: null, action: entry.action, entity_type: entry.entity_type, entity_id: entry.entity_id, before: entry.before ?? null, after: { ...entry.after, by: "tiktok_sync" } });
    };
    const result = await commitRows(db, businessId, { rows: plan.auto, status_changes: plan.statusChanges.map(({ transaction_id, order_status, date, refund_amount }) => ({ transaction_id, order_status, date, refund_amount })), payouts: plan.payouts, upload_ids: [], source: "tiktok", skipped: plan.skipped }, { createdBy: connection.connected_by, audit });
    if (!result.ok) throw new Error(result.error);

    const cancelled = plan.statusChanges.filter((c) => c.order_status === "cancelled").length;
    const refunded = plan.statusChanges.filter((c) => c.order_status === "refunded").length + plan.auto.filter((r) => r.order_status === "refunded").length;
    const { count: queued } = await db.from("sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "pending");
    await db
      .from("tiktok_connections")
      .update({ orders_cursor: maxUpdate ? new Date(maxUpdate * 1000).toISOString() : connection.orders_cursor, finance_cursor: maxStatement ? new Date(maxStatement * 1000).toISOString() : connection.finance_cursor, last_sync_at: new Date(now()).toISOString(), status: "connected", last_error: "", updated_at: new Date(now()).toISOString() })
      .eq("business_id", businessId);
    return finish(
      { status: "ok", orders_new: result.inserted, orders_updated: plan.statusChanges.length, cancellations: cancelled, refunds: refunded, payouts: result.payouts, queued: queued ?? plan.queue.length },
      { fetched: { orders: orders.length, returns: returns.length, settlements: settlements.size, payments: payments.length }, skipped: result.skipped, ignored: plan.ignored },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const tokenExpired = err instanceof TikTokApiError && err.tokenExpired;
    await db.from("tiktok_connections").update({ status: tokenExpired ? "expired" : "error", last_error: message.slice(0, 500), updated_at: new Date(now()).toISOString() }).eq("business_id", businessId);
    return finish({ status: "error", error: message.slice(0, 500) });
  }
}
