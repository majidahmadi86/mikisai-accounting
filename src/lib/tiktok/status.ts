/** What the app shows about the TikTok connection. No secrets ever leave the server in this shape. */
export type SyncLogRow = { id: string; trigger: "cron" | "webhook" | "manual"; started_at: string; finished_at: string | null; status: "running" | "ok" | "error" | "skipped"; orders_new: number; orders_updated: number; cancellations: number; refunds: number; payouts: number; queued: number; error: string };

export type TiktokStatus = {
  configured: boolean;
  connected: boolean;
  state: "not_configured" | "not_connected" | "connected" | "expired" | "error";
  seller_name: string | null;
  shop_name: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  refresh_expires_at: string | null;
  last_error: string;
  last_log: SyncLogRow | null;
  queued: number;
};

export const REFRESH_WARNING_DAYS = 7;

/** Problems worth a line under Data health: a dead token, a failing sync, a refresh token about to run out. */
export function tiktokProblems(status: TiktokStatus | null | undefined, now: number = Date.now()): { id: string; label: string; detail: string }[] {
  if (!status || !status.connected) return [];
  const out: { id: string; label: string; detail: string }[] = [];
  if (status.state === "expired") out.push({ id: "tiktok-token", label: "TikTok token could not be refreshed", detail: status.last_error || "authorize again" });
  else if (status.state === "error") out.push({ id: "tiktok-error", label: "TikTok sync is failing", detail: status.last_error });
  else if (status.last_log && status.last_log.status === "error") out.push({ id: "tiktok-last", label: "The last TikTok sync failed", detail: status.last_log.error });
  if (status.refresh_expires_at) {
    const days = Math.floor((Date.parse(status.refresh_expires_at) - now) / 86400000);
    if (days <= REFRESH_WARNING_DAYS) out.push({ id: "tiktok-refresh", label: "TikTok authorization runs out soon", detail: `${Math.max(0, days)} day(s) left; authorize again` });
  }
  if (status.last_sync_at && now - Date.parse(status.last_sync_at) > 6 * 3600 * 1000) out.push({ id: "tiktok-stale", label: "No TikTok sync for over six hours", detail: status.last_sync_at.slice(0, 16).replace("T", " ") });
  return out;
}

/** "12 min ago" without a library. */
export function relativeTime(iso: string, locale: "en" | "th", now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  const en = locale === "en";
  if (minutes < 1) return en ? "just now" : "เมื่อสักครู่";
  if (minutes < 60) return en ? `${minutes} min ago` : `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return en ? `${hours} h ago` : `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.round(hours / 24);
  return en ? `${days} days ago` : `${days} วันที่แล้ว`;
}
