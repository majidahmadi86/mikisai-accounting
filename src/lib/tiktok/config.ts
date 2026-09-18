import type { TikTokConfig } from "./client";

/** App credentials from the environment; null when the app is not configured yet. Kept free of other imports so any module may read it. */
export function tiktokConfig(env: NodeJS.ProcessEnv = process.env): (TikTokConfig & { serviceId?: string }) | null {
  const appKey = env.TIKTOK_APP_KEY?.trim();
  const appSecret = env.TIKTOK_APP_SECRET?.trim();
  if (!appKey || !appSecret) return null;
  return { appKey, appSecret, serviceId: env.TIKTOK_SERVICE_ID?.trim() || undefined, apiBase: env.TIKTOK_API_BASE?.trim() || undefined, authBase: env.TIKTOK_AUTH_BASE?.trim() || undefined };
}
