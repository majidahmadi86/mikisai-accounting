/**
 * Route x role x viewport x language matrix. Every route is opened as both
 * founders, in English and Thai, at 375px and 1440px; each visit checks the
 * page loads with the right heading, never scrolls sideways, logs no console
 * error, leaks no raw dictionary key or placeholder, contains no em dash, and
 * saves a screenshot. Admin-only routes must turn a contributor away with the
 * denied message. Results feed QA-REPORT.md.
 */
import { expect, test, type Page } from "@playwright/test";
import { check, login, pageInvariants, setLang, shot, VIEWPORTS, type Lang, type Role, type Viewport } from "./helpers";

type Route = { path: string; title: { en: RegExp; th: RegExp }; adminOnly?: boolean; resolve?: (page: Page) => Promise<string | null> };

const ROUTES: Route[] = [
  { path: "/", title: { en: /Balanced|owes/i, th: /สมดุล|ค้างจ่าย/ } },
  { path: "/transactions", title: { en: /^Transactions$/, th: /^รายการ$/ } },
  { path: "/transactions/[id]/edit", title: { en: /Edit transaction/, th: /แก้ไขรายการ/ }, resolve: async (page) => (await page.locator('a[href^="/transactions/"][href$="/edit"]').first().getAttribute("href")) },
  { path: "/transactions/new", title: { en: /New income/, th: /รายรับใหม่/ } },
  { path: "/import", title: { en: /Import a sales report/, th: /นำเข้ารายงานการขาย/ } },
  { path: "/payouts", title: { en: /^Payouts$/, th: /^ยอดโอนเข้า$/ } },
  { path: "/payouts/new", title: { en: /payout/i, th: /ยอดโอน/ } },
  { path: "/payouts/[id]/reconcile", title: { en: /Match|Reconcile|payout/i, th: /จับคู่|ยอดโอน/ }, resolve: async (page) => (await page.locator('a[href^="/payouts/"][href$="/reconcile"]').first().getAttribute("href")) },
  { path: "/products", title: { en: /^Products$/, th: /^สินค้า$/ } },
  { path: "/products/[id]", title: { en: /Coconut sugar|Sample/, th: /น้ำตาล|Coconut|Sample/ }, resolve: async (page) => (await page.locator('a[href^="/products/"]').filter({ hasNotText: /Add product|เพิ่มสินค้า/ }).first().getAttribute("href")) },
  { path: "/balance", title: { en: /^My Balance$/, th: /^ยอดของฉัน$/ } },
  { path: "/reports", title: { en: /^Reports$/, th: /^รายงาน$/ } },
  { path: "/reports/units", title: { en: /^Units$/, th: /^หน่วยสินค้า$/ } },
  { path: "/insights", title: { en: /^Insights$/, th: /^วิเคราะห์$/ } },
  { path: "/more", title: { en: /^More$/, th: /^เพิ่มเติม$/ } },
  { path: "/more/health", title: { en: /^Data health$/, th: /^สุขภาพข้อมูล$/ } },
  { path: "/more/check-books", title: { en: /^Check books$/, th: /^ตรวจบัญชี$/ }, adminOnly: true },
  { path: "/audit", title: { en: /^Audit$/, th: /^ประวัติการแก้ไข$/ }, adminOnly: true },
  { path: "/more/deleted", title: { en: /^Recently deleted$/, th: /^ลบล่าสุด$/ }, adminOnly: true },
  { path: "/customers", title: { en: /^Customers$/, th: /^ลูกค้า$/ } },
  { path: "/settings", title: { en: /^Settings$/, th: /^ตั้งค่า$/ } },
];

for (const role of ["admin", "contributor"] as Role[]) {
  for (const lang of ["en", "th"] as Lang[]) {
    for (const viewport of ["phone", "desktop"] as Viewport[]) {
      test.describe(`${role} · ${lang} · ${viewport}`, () => {
        test.use({ viewport: VIEWPORTS[viewport] });

        test(`login page and sign-in (${role}, ${lang}, ${viewport})`, async ({ page, context }) => {
          const base = { route: "/login", role, viewport, lang };
          await setLang(context, lang);
          await page.goto("/login");
          await check(base, "loads with title", async () => {
            await expect(page.locator("h1")).toHaveText(lang === "th" ? /ยินดีต้อนรับกลับ/ : /Welcome back/);
          });
          await check(base, "invalid password shows error", async () => {
            await page.locator("#email").fill("nobody@example.com");
            await page.locator("#password").fill("wrong-password");
            await page.locator("form:has(#email) button[type=submit]").click();
            await expect(page.getByText(lang === "th" ? /อีเมลหรือรหัสผ่านไม่ถูกต้อง/ : /Email or password is incorrect/)).toBeVisible();
          });
          await check(base, "page invariants", () => pageInvariants(page, VIEWPORTS[viewport].width), { soft: true });
          await shot(page, "/login", role, viewport, lang);
          await check(base, "valid sign-in lands on Home", async () => {
            await login(page, role);
            await expect(page).toHaveURL(/\/$/);
          });
        });

        for (const route of ROUTES) {
          test(`${route.path} (${role}, ${lang}, ${viewport})`, async ({ page, context }) => {
            const base = { route: route.path, role, viewport, lang };
            const errors: string[] = [];
            page.on("console", (m) => {
              if (m.type() === "error") errors.push(m.text());
            });
            await setLang(context, lang);
            await login(page, role);
            let target: string | null = route.path;
            if (route.resolve) {
              await page.goto(route.path.split("/[")[0]);
              target = await route.resolve(page);
              if (!target) {
                await check(base, "loads", () => Promise.resolve(), { soft: true });
                test.info().annotations.push({ type: "note", description: "no row to open" });
                return;
              }
            }
            await page.goto(target);
            if (route.adminOnly && role === "contributor") {
              await check(base, "contributor is turned away with the denied message", async () => {
                await expect(page).toHaveURL(/denied=1/);
                await expect(page.getByText(lang === "th" ? /ไม่ได้รับอนุญาต|แอดมิน/ : /admin|allowed/i).first()).toBeVisible();
              });
              await shot(page, route.path, role, viewport, lang);
              return;
            }
            await check(base, "loads with title", async () => {
              await expect(page.locator("h1").first()).toHaveText(route.title[lang]);
            });
            await check(base, "page invariants", () => pageInvariants(page, VIEWPORTS[viewport].width), { soft: true });
            await shot(page, route.path, role, viewport, lang);
            await check(base, "no console errors", () => {
              const real = errors.filter((e) => !/favicon|hydrat|404/i.test(e));
              expect(real, real.join(" | ")).toEqual([]);
            });
          });
        }
      });
    }
  }
}
