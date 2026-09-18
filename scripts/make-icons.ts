/**
 * Renders the MS monogram (public/brand/ms-monogram.svg) to the PNG icons the
 * web app manifest and iOS home screen need, using Playwright's bundled Chromium.
 *
 *   npx tsx scripts/make-icons.ts
 *
 * Outputs (public/icons/):
 *   icon-192.png, icon-512.png       purpose "any": ivory rounded square, transparent corners
 *   icon-512-maskable.png            purpose "maskable": full-bleed ivory, monogram inside the 80% safe zone
 *   apple-touch-icon-180.png         iOS applies its own mask, so full-bleed ivory
 *
 * If Chromium is missing: npx playwright install chromium
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const IVORY = "#FAF7F2";
// The monogram viewBox is 117 wide by 132 tall.
const MONOGRAM_RATIO = 117 / 132;

type Variant = "any" | "maskable" | "apple";
const ICONS: { file: string; size: number; variant: Variant }[] = [
  { file: "icon-192.png", size: 192, variant: "any" },
  { file: "icon-512.png", size: 512, variant: "any" },
  { file: "icon-512-maskable.png", size: 512, variant: "maskable" },
  { file: "apple-touch-icon-180.png", size: 180, variant: "apple" },
];

function html(svgDataUri: string, size: number, variant: Variant): string {
  // Maskable icons are cropped to a circle of 80% diameter; a 117x132 box fits inside it at 60% height.
  const height = Math.round(size * (variant === "maskable" ? 0.58 : 0.7));
  const width = Math.round(height * MONOGRAM_RATIO);
  const radius = variant === "any" ? Math.round(size * 0.22) : 0;
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\"><style>",
    "html, body { margin: 0; padding: 0; background: transparent; }",
    `.tile { width: ${size}px; height: ${size}px; border-radius: ${radius}px; background: ${IVORY}; display: flex; align-items: center; justify-content: center; }`,
    `img { width: ${width}px; height: ${height}px; display: block; }`,
    "</style></head><body><div class=\"tile\">",
    `<img src="${svgDataUri}" alt="">`,
    "</div></body></html>",
  ].join("\n");
}

async function main() {
  const svg = readFileSync("public/brand/ms-monogram.svg", "utf8");
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  mkdirSync("public/icons", { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const icon of ICONS) {
      const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
      await page.setContent(html(dataUri, icon.size, icon.variant), { waitUntil: "load" });
      const png = await page.screenshot({
        type: "png",
        omitBackground: icon.variant === "any",
        clip: { x: 0, y: 0, width: icon.size, height: icon.size },
      });
      writeFileSync(`public/icons/${icon.file}`, png);
      await page.close();
      console.log(`wrote public/icons/${icon.file} (${icon.size}x${icon.size}, ${png.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
