/**
 * v2.6 report screens: /stock, /investment and Reports at 375px and 1440px,
 * signed in as the admin. Written to test-results/screens/. Nothing changes.
 */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const OUT = "test-results/screens";

for (const [name, viewport] of [
  ["375", { width: 375, height: 812 }],
  ["1440", { width: 1440, height: 900 }],
] as const) {
  test(`v2.6 screens at ${name}px`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize(viewport);
    await page.addInitScript(() => window.localStorage.setItem("mikisai.tour.v1", "done"));
    await page.goto("/login");
    await page.locator("#email").fill(process.env.SEED_MIKE_EMAIL!);
    await page.locator("#password").fill(process.env.SEED_MIKE_PASSWORD!);
    await page.locator("form:has(#email) button[type=submit]").click();
    await page.waitForURL("**/");

    for (const [route, heading] of [
      ["/stock", "Stock"],
      ["/investment", "Investment"],
      ["/reports?period=month", "Reports"],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      // Nothing in the header wraps: it stays one line high.
      const header = await page.locator("header").boundingBox();
      expect(header!.height, `${route} header height at ${name}px`).toBeLessThan(80);
      await page.screenshot({ path: `${OUT}/${route.replace(/[^a-z]/gi, "") || "home"}-${name}.png`, fullPage: true });
    }
  });
}
