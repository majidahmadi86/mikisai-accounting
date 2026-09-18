/**
 * TikTok Shop Open API transport: request signing, token exchange and
 * refresh, and the handful of endpoints the sync reads. No framework imports,
 * so the sync, the scripts and the tests share it. The fetch implementation
 * and the clock can be injected.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { TikTokEnvelope, TikTokOrder, TikTokPayment, TikTokReturn, TikTokStatement, TikTokStatementTransaction } from "./types";

export type TikTokConfig = { appKey: string; appSecret: string; apiBase?: string; authBase?: string; fetchImpl?: typeof fetch; now?: () => number; retryDelayMs?: number };
export type TokenSet = { accessToken: string; refreshToken: string; accessExpiresAt: number; refreshExpiresAt: number; openId: string | null; sellerName: string | null };
export type Shop = { id: string; name: string; region: string; cipher: string; code: string | null };

export const DEFAULT_API_BASE = "https://open-api.tiktokglobalshop.com";
export const DEFAULT_AUTH_BASE = "https://auth.tiktok-shops.com";

export class TikTokApiError extends Error {
  code: number;
  httpStatus: number;
  requestId: string | null;
  retryable: boolean;
  tokenExpired: boolean;
  constructor(message: string, opts: { code: number; httpStatus: number; requestId?: string | null }) {
    super(message);
    this.name = "TikTokApiError";
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.requestId = opts.requestId ?? null;
    this.tokenExpired = opts.httpStatus === 401 || (opts.code >= 105000 && opts.code <= 105003);
    this.retryable = opts.httpStatus === 429 || opts.httpStatus >= 500 || String(opts.code).startsWith("12052");
  }
}

/**
 * Sign a request the way the Open API asks: every query parameter except
 * sign and access_token, sorted by key, as key+value; the path in front; the
 * raw JSON body behind when there is one; the app secret on both ends;
 * HMAC-SHA256 with the app secret; lowercase hex.
 */
export function signRequest(appSecret: string, path: string, query: Record<string, string>, body?: string): string {
  const params = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort()
    .map((k) => `${k}${query[k]}`)
    .join("");
  const base = `${appSecret}${path}${params}${body ?? ""}${appSecret}`;
  return createHmac("sha256", appSecret).update(base).digest("hex");
}

/** The link Sai opens to approve the app for the shop. */
export function authorizeUrl(cfg: { appKey: string; serviceId?: string }, state: string): string {
  if (cfg.serviceId) return `https://services.tiktokshop.com/open/authorize?service_id=${encodeURIComponent(cfg.serviceId)}&state=${encodeURIComponent(state)}`;
  return `${DEFAULT_AUTH_BASE}/oauth/authorize?app_key=${encodeURIComponent(cfg.appKey)}&state=${encodeURIComponent(state)}`;
}

type TokenData = { access_token?: string; access_token_expire_in?: number; refresh_token?: string; refresh_token_expire_in?: number; open_id?: string; seller_name?: string };

async function tokenCall(cfg: TikTokConfig, path: string, params: Record<string, string>): Promise<TokenSet> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const url = new URL(path, cfg.authBase ?? DEFAULT_AUTH_BASE);
  for (const [k, v] of Object.entries({ app_key: cfg.appKey, app_secret: cfg.appSecret, ...params })) url.searchParams.set(k, v);
  const res = await doFetch(url.toString(), { method: "GET" });
  const json = (await res.json().catch(() => null)) as TikTokEnvelope<TokenData> | null;
  if (!res.ok || !json || json.code !== 0 || !json.data?.access_token || !json.data.refresh_token) {
    throw new TikTokApiError(json?.message || `token call failed (${res.status})`, { code: json?.code ?? -1, httpStatus: res.status, requestId: json?.request_id });
  }
  const d = json.data;
  return { accessToken: d.access_token!, refreshToken: d.refresh_token!, accessExpiresAt: Number(d.access_token_expire_in ?? 0), refreshExpiresAt: Number(d.refresh_token_expire_in ?? 0), openId: d.open_id ?? null, sellerName: d.seller_name ?? null };
}

export function exchangeAuthCode(cfg: TikTokConfig, authCode: string): Promise<TokenSet> {
  return tokenCall(cfg, "/api/v2/token/get", { auth_code: authCode, grant_type: "authorized_code" });
}

export function refreshAccessToken(cfg: TikTokConfig, refreshToken: string): Promise<TokenSet> {
  return tokenCall(cfg, "/api/v2/token/refresh", { refresh_token: refreshToken, grant_type: "refresh_token" });
}

/**
 * Webhooks are signed with HMAC-SHA256 over app_key + raw body, keyed with
 * the app secret, hex, in the Authorization header.
 */
export function verifyWebhookSignature(appKey: string, appSecret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", appSecret).update(`${appKey}${rawBody}`).digest("hex");
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class TikTokClient {
  private cfg: TikTokConfig;
  private auth: { accessToken: string; shopCipher?: string };

  constructor(cfg: TikTokConfig, auth: { accessToken: string; shopCipher?: string }) {
    this.cfg = cfg;
    this.auth = auth;
  }

  private async request<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, string | undefined>; body?: unknown; shopLevel?: boolean } = {}): Promise<T> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const delay = this.cfg.retryDelayMs ?? 800;
    let lastError: TikTokApiError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const query: Record<string, string> = { app_key: this.cfg.appKey, timestamp: String(Math.floor((this.cfg.now?.() ?? Date.now()) / 1000)) };
      if (opts.shopLevel !== false && this.auth.shopCipher) query.shop_cipher = this.auth.shopCipher;
      for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") query[k] = v;
      query.sign = signRequest(this.cfg.appSecret, path, query, body);
      const url = new URL(path, this.cfg.apiBase ?? DEFAULT_API_BASE);
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
      const res = await doFetch(url.toString(), { method, headers: { "content-type": "application/json", "x-tts-access-token": this.auth.accessToken }, body });
      const json = (await res.json().catch(() => null)) as TikTokEnvelope<T> | null;
      if (res.ok && json && json.code === 0) return (json.data ?? ({} as T)) as T;
      lastError = new TikTokApiError(json?.message || `request failed (${res.status})`, { code: json?.code ?? -1, httpStatus: res.status, requestId: json?.request_id });
      if (!lastError.retryable || attempt === 2) break;
      await sleep(delay * (attempt + 1));
    }
    throw lastError!;
  }

  private async *paged<T>(path: string, listKey: string, query: Record<string, string | undefined>, body: unknown, pageSize: number): AsyncGenerator<T> {
    let token: string | undefined;
    for (let page = 0; page < 200; page += 1) {
      const data = await this.request<Record<string, unknown>>("POST", path, { query: { ...query, page_size: String(pageSize), page_token: token }, body });
      const list = (data[listKey] as T[] | undefined) ?? [];
      for (const item of list) yield item;
      token = (data.next_page_token as string | undefined) || undefined;
      if (!token || list.length === 0) return;
    }
  }

  async getAuthorizedShops(): Promise<Shop[]> {
    const data = await this.request<{ shops?: { id: string; name?: string; region?: string; cipher: string; code?: string }[] }>("GET", "/authorization/202309/shops", { shopLevel: false });
    return (data.shops ?? []).map((s) => ({ id: s.id, name: s.name ?? "", region: s.region ?? "", cipher: s.cipher, code: s.code ?? null }));
  }

  searchOrders(params: { updateTimeGe: number; updateTimeLt?: number; pageSize?: number }): AsyncGenerator<TikTokOrder> {
    const body: Record<string, number> = { update_time_ge: params.updateTimeGe };
    if (params.updateTimeLt) body.update_time_lt = params.updateTimeLt;
    return this.paged<TikTokOrder>("/order/202309/orders/search", "orders", { sort_field: "update_time", sort_order: "ASC" }, body, params.pageSize ?? 50);
  }

  async getOrders(ids: string[]): Promise<TikTokOrder[]> {
    const out: TikTokOrder[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.request<{ orders?: TikTokOrder[] }>("GET", "/order/202309/orders", { query: { ids: ids.slice(i, i + 50).join(",") } });
      out.push(...(data.orders ?? []));
    }
    return out;
  }

  searchReturns(params: { updateTimeGe: number; pageSize?: number }): AsyncGenerator<TikTokReturn> {
    return this.paged<TikTokReturn>("/return_refund/202309/returns/search", "return_orders", {}, { update_time_ge: params.updateTimeGe }, params.pageSize ?? 50);
  }

  searchStatements(params: { statementTimeGe: number; pageSize?: number }): AsyncGenerator<TikTokStatement> {
    return this.paged<TikTokStatement>("/finance/202309/statements/search", "statements", { sort_field: "statement_time", sort_order: "ASC" }, { statement_time_ge: params.statementTimeGe }, params.pageSize ?? 50);
  }

  async getStatementTransactions(statementId: string): Promise<TikTokStatementTransaction[]> {
    const data = await this.request<{ statement_transactions?: TikTokStatementTransaction[] }>("GET", `/finance/202309/statements/${encodeURIComponent(statementId)}/statement_transactions`);
    return data.statement_transactions ?? [];
  }

  searchPayments(params: { createTimeGe?: number; pageSize?: number } = {}): AsyncGenerator<TikTokPayment> {
    return this.paged<TikTokPayment>("/finance/202309/payments/search", "payments", {}, params.createTimeGe ? { create_time_ge: params.createTimeGe } : {}, params.pageSize ?? 50);
  }
}
