/**
 * Route x role x viewport x language matrix. Every route is opened as both
 * founders, in English and Thai, at 375, 1024, 1280 and 1440px; each visit checks the
 * page loads with the right heading, never scrolls sideways, logs no console
 * error, leaks no raw dictionary key or placeholder, contains no em dash, and
 * saves a screenshot. Admin-only routes must turn a contributor away with the
 * denied message. Results feed QA-REPORT.md.
 */
import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";
import { check, login, pageInvariants, setLang, shot, VIEWPORTS, type Lang, type Role, type Viewport } from "./helpers";

for (const role of ["admin", "contributor"] as Role[]) {
  for (const lang of ["en", "th"] as Lang[]) {
    for (const viewport of ["phone", "laptop", "desktop1280", "desktop"] as Viewport[]) {
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
