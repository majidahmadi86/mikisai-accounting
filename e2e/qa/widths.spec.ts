/**
 * Width assertions (v3.0). Every route at 375, 390, 768, 1024, 1280 and
 * 1440px, in English and Thai: document.documentElement.scrollWidth equals
 * window.innerWidth, no element is wider than the viewport, and from 768px
 * the header's scrollWidth equals its clientWidth. Any failure is a defect.
 */
import { test } from "@playwright/test";
import { check, login, setLang, VIEWPORTS, widthInvariants, type Lang, type Viewport } from "./helpers";
import { ROUTES } from "./routes";

const WIDTHS: Viewport[] = ["phone", "phone390", "tablet", "laptop", "desktop1280", "desktop"];

for (const lang of ["en", "th"] as Lang[]) {
  for (const viewport of WIDTHS) {
    test(`no sideways scroll on any route (${lang}, ${VIEWPORTS[viewport].width}px)`, async ({ page, context }) => {
      test.setTimeout(240_000);
      await page.setViewportSize(VIEWPORTS[viewport]);
      await setLang(context, lang);
      await login(page, "admin");
      const failures: string[] = [];
      for (const route of ROUTES) {
        let target: string | null = route.path;
        if (route.resolve) {
          await page.goto(route.path.split("/[")[0]);
          target = await route.resolve(page);
          if (!target) continue;
        }
        await page.goto(target);
        await page.locator("h1").first().waitFor();
        const ok = await check({ route: route.path, role: "admin", viewport, lang }, "width invariants", () => widthInvariants(page, VIEWPORTS[viewport].width), { soft: true });
        if (!ok) failures.push(route.path);
      }
      if (failures.length) throw new Error(`Sideways scroll or overflow at ${VIEWPORTS[viewport].width}px on: ${failures.join(", ")}`);
    });
  }
}
