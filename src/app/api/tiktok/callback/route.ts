import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeAuthCode, TikTokClient } from "@/lib/tiktok/client";
import { encryptSecret, verifyState } from "@/lib/tiktok/crypto";
import { tiktokConfig } from "@/lib/tiktok/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TikTok sends Sai back here after she approves the app. The signed state
 * says which business started it; the code becomes tokens, the tokens are
 * encrypted and stored where only the service role can read them.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (query: string) => NextResponse.redirect(new URL(`/more/connect-tiktok?${query}`, request.url), 303);
  const code = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
  const state = url.searchParams.get("state");
  const config = tiktokConfig();
  if (!config) return back("error=not_configured");
  if (!code || !state) return back("error=missing_code");
  const who = verifyState(state, config.appSecret);
  if (!who) return back("error=bad_state");

  try {
    const tokens = await exchangeAuthCode(config, code);
    const shops = await new TikTokClient(config, { accessToken: tokens.accessToken }).getAuthorizedShops();
    const shop = shops[0] ?? null;
    const admin = createAdminClient();
    const { error } = await admin.from("tiktok_connections").upsert(
      {
        business_id: who.businessId,
        shop_id: shop?.id ?? null,
        shop_cipher: shop?.cipher ?? null,
        shop_name: shop?.name ?? null,
        region: shop?.region ?? null,
        seller_name: tokens.sellerName,
        open_id: tokens.openId,
        access_token_enc: encryptSecret(tokens.accessToken),
        refresh_token_enc: encryptSecret(tokens.refreshToken),
        access_expires_at: new Date(tokens.accessExpiresAt * 1000).toISOString(),
        refresh_expires_at: new Date(tokens.refreshExpiresAt * 1000).toISOString(),
        status: "connected",
        last_error: "",
        connected_by: who.userId,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id" },
    );
    if (error) return back("error=store_failed");
    await admin.from("audit_log").insert({ business_id: who.businessId, actor_user_id: who.userId, action: "update", entity_type: "system_correction", entity_id: "tiktok-connection", before: null, after: { event: "tiktok_connected", shop: shop?.name ?? null, seller: tokens.sellerName } });
    return back("connected=1");
  } catch (err) {
    console.error("[tiktok] callback failed", err instanceof Error ? err.message : err);
    return back("error=exchange_failed");
  }
}
