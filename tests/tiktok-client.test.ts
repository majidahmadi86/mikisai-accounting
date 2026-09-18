import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorizeUrl, exchangeAuthCode, refreshAccessToken, signRequest, TikTokApiError, TikTokClient, verifyWebhookSignature, type TikTokConfig } from "@/lib/tiktok/client";
import { decryptSecret, encryptSecret, signState, verifyState } from "@/lib/tiktok/crypto";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/tiktok/${name}`, import.meta.url), "utf8");
const json = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "application/json" } });

type Call = { url: URL; method: string; headers: Record<string, string>; body: string | null };

/** A fetch that serves the recorded fixtures by path, the way the real API would. */
function recordedFetch(calls: Call[], overrides: Record<string, () => Response> = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: (init?.body as string | undefined) ?? null });
    const override = overrides[url.pathname];
    if (override) return override();
    if (url.pathname === "/authorization/202309/shops") return json(fixture("shops.json"));
    if (url.pathname === "/order/202309/orders/search") return json(fixture(url.searchParams.get("page_token") === "page-2" ? "orders-search-page2.json" : "orders-search-page1.json"));
    if (url.pathname === "/return_refund/202309/returns/search") return json(fixture("returns-search.json"));
    if (url.pathname === "/finance/202309/statements/search") return json(fixture("statements-search.json"));
    if (url.pathname.startsWith("/finance/202309/statements/")) return json(fixture(`statement-transactions-${url.pathname.split("/")[4]}.json`));
    if (url.pathname === "/finance/202309/payments/search") return json(fixture("payments-search.json"));
    if (url.pathname === "/api/v2/token/get") return json(fixture("token-get.json"));
    if (url.pathname === "/api/v2/token/refresh") return json(fixture("token-refresh.json"));
    return json(JSON.stringify({ code: 404, message: "unknown path" }), 404);
  }) as typeof fetch;
}

const cfg = (calls: Call[], overrides?: Record<string, () => Response>): TikTokConfig => ({ appKey: "app123", appSecret: "secret456", fetchImpl: recordedFetch(calls, overrides), now: () => 1_789_000_000_000, retryDelayMs: 1 });

describe("TikTok Shop client", () => {
  it("signs requests by the documented recipe", () => {
    const query = { app_key: "app123", timestamp: "1789000000", shop_cipher: "TTP_x", page_size: "50", sign: "ignored", access_token: "ignored" };
    const body = JSON.stringify({ update_time_ge: 1 });
    const base = `secret456/order/202309/orders/searchapp_keyapp123page_size50shop_cipherTTP_xtimestamp1789000000${body}secret456`;
    const expected = createHmac("sha256", "secret456").update(base).digest("hex");
    expect(signRequest("secret456", "/order/202309/orders/search", query, body)).toBe(expected);
    // Frozen, so a change to the recipe is caught even if this test's own recipe changes with it.
    expect(expected).toBe("8e56181319a2b1d09d65694aefb4edd815dcf36e395e8ff881f41905a6f74cef");
  });

  it("sends the access token, the shop cipher and a signature, and follows next_page_token", async () => {
    const calls: Call[] = [];
    const client = new TikTokClient(cfg(calls), { accessToken: "ROW_token", shopCipher: "TTP_cipher" });
    const ids: string[] = [];
    for await (const o of client.searchOrders({ updateTimeGe: 1 })) ids.push(o.id);
    expect(ids).toHaveLength(4);
    expect(calls).toHaveLength(2);
    expect(calls[1].url.searchParams.get("page_token")).toBe("page-2");
    for (const c of calls) {
      expect(c.headers["x-tts-access-token"]).toBe("ROW_token");
      expect(c.url.searchParams.get("shop_cipher")).toBe("TTP_cipher");
      expect(c.url.searchParams.get("sign")).toMatch(/^[0-9a-f]{64}$/);
      const query = Object.fromEntries(c.url.searchParams.entries());
      expect(c.url.searchParams.get("sign")).toBe(signRequest("secret456", c.url.pathname, query, c.body ?? undefined));
    }
  });

  it("reads shops without a shop cipher, statements with their transactions, and payments", async () => {
    const calls: Call[] = [];
    const client = new TikTokClient(cfg(calls), { accessToken: "t", shopCipher: "c" });
    expect((await client.getAuthorizedShops())[0]).toMatchObject({ name: "MikiSai", cipher: "TTP_mock_cipher_mikisai", region: "TH" });
    expect(calls[0].url.searchParams.get("shop_cipher")).toBeNull();
    const statements = [];
    for await (const s of client.searchStatements({ statementTimeGe: 1 })) statements.push(s);
    expect(statements.map((s) => s.payment_status)).toEqual(["PAID", "PROCESSING"]);
    expect(await client.getStatementTransactions(statements[0].id)).toHaveLength(1);
    const payments = [];
    for await (const p of client.searchPayments({})) payments.push(p);
    expect(payments).toHaveLength(2);
  });

  it("raises a token error for code 105002 and retries a 503", async () => {
    const calls: Call[] = [];
    const expired = new TikTokClient(cfg(calls, { "/authorization/202309/shops": () => json(fixture("error-token-expired.json")) }), { accessToken: "t" });
    await expect(expired.getAuthorizedShops()).rejects.toMatchObject({ name: "TikTokApiError", code: 105002, tokenExpired: true, retryable: false });

    let n = 0;
    const flaky = new TikTokClient(cfg([], { "/authorization/202309/shops": () => (n++ === 0 ? json(JSON.stringify({ code: 12052000, message: "busy" }), 503) : json(fixture("shops.json"))) }), { accessToken: "t" });
    expect(await flaky.getAuthorizedShops()).toHaveLength(1);
    expect(n).toBe(2);
    expect(new TikTokApiError("x", { code: 1, httpStatus: 429 }).retryable).toBe(true);
  });

  it("exchanges and refreshes tokens", async () => {
    const calls: Call[] = [];
    const first = await exchangeAuthCode(cfg(calls), "code-1");
    expect(first).toMatchObject({ accessToken: "ROW_mock_access_1", refreshToken: "ROW_mock_refresh_1", sellerName: "MikiSai" });
    expect(first.refreshExpiresAt).toBeGreaterThan(first.accessExpiresAt);
    expect(calls[0].url.searchParams.get("grant_type")).toBe("authorized_code");
    const second = await refreshAccessToken(cfg(calls), first.refreshToken);
    expect(second.accessToken).toBe("ROW_mock_access_2");
    expect(calls[1].url.searchParams.get("refresh_token")).toBe("ROW_mock_refresh_1");
    await expect(refreshAccessToken(cfg([], { "/api/v2/token/refresh": () => json(JSON.stringify({ code: 36004004, message: "refresh token expired" })) }), "dead")).rejects.toBeInstanceOf(TikTokApiError);
  });

  it("builds the authorize link and checks webhook signatures", () => {
    expect(authorizeUrl({ appKey: "app123", serviceId: "svc9" }, "st")).toBe("https://services.tiktokshop.com/open/authorize?service_id=svc9&state=st");
    expect(authorizeUrl({ appKey: "app123" }, "st")).toContain("app_key=app123");
    const body = JSON.stringify({ type: 1, shop_id: "7495000000000000001" });
    const good = createHmac("sha256", "secret456").update(`app123${body}`).digest("hex");
    expect(verifyWebhookSignature("app123", "secret456", body, good)).toBe(true);
    expect(verifyWebhookSignature("app123", "secret456", body, good.replace(/.$/, "0") === good ? good.replace(/.$/, "1") : good.replace(/.$/, "0"))).toBe(false);
    expect(verifyWebhookSignature("app123", "secret456", body, null)).toBe(false);
  });
});

describe("token storage and OAuth state", () => {
  const key = Buffer.alloc(32, 7);
  it("encrypts and decrypts, and never stores the plain token", () => {
    const stored = encryptSecret("ROW_mock_access_1", key);
    expect(stored).not.toContain("ROW_mock");
    expect(decryptSecret(stored, key)).toBe("ROW_mock_access_1");
    expect(encryptSecret("ROW_mock_access_1", key)).not.toBe(stored);
    expect(() => decryptSecret(stored, Buffer.alloc(32, 8))).toThrow();
  });
  it("accepts its own fresh state and refuses a forged or stale one", () => {
    const now = 1_789_000_000_000;
    const state = signState({ businessId: "biz", userId: "user", at: now }, "secret456");
    expect(verifyState(state, "secret456", now + 60_000)).toEqual({ businessId: "biz", userId: "user" });
    expect(verifyState(state, "other-secret", now)).toBeNull();
    expect(verifyState(state, "secret456", now + 16 * 60_000)).toBeNull();
    expect(verifyState("garbage", "secret456", now)).toBeNull();
  });
});
