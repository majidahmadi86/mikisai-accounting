/**
 * A stand-in for the TikTok Shop Open API that serves the recorded fixtures in
 * tests/fixtures/tiktok at the real paths (token endpoints on the same
 * origin), so the whole sync can run locally before TikTok approves the app.
 *
 *   npx tsx scripts/tiktok-mock-server.ts [port] [--safe-payouts]
 *
 * --safe-payouts turns every paid payment into 1.00 baht, so a run against a
 * real ledger records the payout but can never match and settle real orders.
 * Point the app at it with TIKTOK_API_BASE and TIKTOK_AUTH_BASE.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const port = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 4545);
const safePayouts = process.argv.includes("--safe-payouts");
const dir = join(__dirname, "..", "tests", "fixtures", "tiktok");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");

function payments(): string {
  const body = JSON.parse(fixture("payments-search.json")) as { data: { payments: { status: string; amount?: { value?: string } }[] } };
  if (safePayouts) for (const p of body.data.payments) if (p.status === "PAID" && p.amount) p.amount.value = "1.00";
  return JSON.stringify(body);
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const path = url.pathname;
  let body: string | null = null;
  if (path === "/authorization/202309/shops") body = fixture("shops.json");
  else if (path === "/order/202309/orders/search") body = fixture(url.searchParams.get("page_token") === "page-2" ? "orders-search-page2.json" : "orders-search-page1.json");
  else if (path === "/return_refund/202309/returns/search") body = fixture("returns-search.json");
  else if (path === "/finance/202309/statements/search") body = fixture("statements-search.json");
  else if (/^\/finance\/202309\/statements\/\d+\/statement_transactions$/.test(path)) body = fixture(`statement-transactions-${path.split("/")[4]}.json`);
  else if (path === "/finance/202309/payments/search") body = payments();
  else if (path === "/api/v2/token/get") body = fixture("token-get.json");
  else if (path === "/api/v2/token/refresh") body = fixture("token-refresh.json");
  console.log(`${req.method} ${path} ${body ? 200 : 404} sign=${url.searchParams.get("sign") ? "yes" : "no"}`);
  // Drain the request body, then answer.
  req.on("data", () => {});
  req.on("end", () => {
    res.writeHead(body ? 200 : 404, { "content-type": "application/json" });
    res.end(body ?? JSON.stringify({ code: 404, message: "unknown path" }));
  });
}).listen(port, "127.0.0.1", () => console.log(`TikTok mock on http://127.0.0.1:${port}${safePayouts ? " (safe payouts)" : ""}`));
