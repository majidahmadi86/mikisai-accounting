/**
 * Builds QA-REPORT.md from the QA sweep results (qa-output/results.jsonl,
 * one line per check written by e2e/qa/*.spec.ts) and the defect log kept in
 * e2e/qa/defects.json.
 *
 *   npm run test:qa && npm run qa:report
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

type Result = { route: string; role: string; viewport: string; lang: string; check: string; pass: boolean; note?: string };
type Defect = { id: string; route: string; found: string; description: string; fix: string; commit: string; status: "fixed" | "open" };

const file = "qa-output/results.jsonl";
const results: Result[] = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Result) : [];
const defects: Defect[] = existsSync("e2e/qa/defects.json") ? (JSON.parse(readFileSync("e2e/qa/defects.json", "utf8")) as Defect[]) : [];

// Latest result wins per (route, role, viewport, lang, check).
const latest = new Map<string, Result>();
for (const r of results) latest.set([r.route, r.role, r.viewport, r.lang, r.check].join("|"), r);
const rows = Array.from(latest.values());

const routes = Array.from(new Set(rows.map((r) => r.route))).sort();
const combos: [string, string, string][] = [];
for (const role of ["admin", "contributor"]) for (const viewport of ["phone", "laptop", "desktop1280", "desktop"]) for (const lang of ["en", "th"]) combos.push([role, viewport, lang]);

const cell = (route: string, role: string, viewport: string, lang: string): string => {
  const set = rows.filter((r) => r.route === route && r.role === role && r.viewport === viewport && r.lang === lang);
  if (!set.length) return "·";
  const failed = set.filter((r) => !r.pass).length;
  return failed ? `FAIL ${set.length - failed}/${set.length}` : `pass ${set.length}`;
};

const total = rows.length;
const failed = rows.filter((r) => !r.pass);
const shots = existsSync("qa-output/shots") ? readdirSync("qa-output/shots").sort() : [];

let md = `# QA report · MikiSai Accounting v2.5 to v3.0\n\n`;
md += `Generated ${new Date().toISOString()} from ${total} recorded checks across ${routes.length} routes. `;
const open = defects.filter((d) => d.status !== "fixed");
md += failed.length ? `**${failed.length} check(s) failing.**\n\n` : open.length ? `**All checks pass; ${open.length} defect(s) still open, listed below.**\n\n` : `**All checks pass; zero known defects.**\n\n`;
md += `Each cell is the number of checks that passed for that route as that role, at that viewport (phone = 375px, laptop = 1024px, desktop1280 = 1280px, desktop = 1440px), in that language. A check is one assertion group: page loads with the right heading, page invariants (document scrollWidth equals window.innerWidth, no element wider than the viewport, header scrollWidth equals clientWidth from 768px, no raw dictionary key, no unfilled placeholder, no em dash, a heading), no console errors, plus the form, export and role checks the flow specs record.\n\n`;

md += `## Route × role × viewport × language\n\n| Route | ${combos.map(([r, v, l]) => `${r} · ${v} · ${l}`).join(" | ")} |\n|---|${combos.map(() => "---").join("|")}|\n`;
for (const route of routes) md += `| \`${route}\` | ${combos.map(([r, v, l]) => cell(route, r, v, l)).join(" | ")} |\n`;

const WIDTHS: [string, number][] = [["phone", 375], ["phone390", 390], ["tablet", 768], ["laptop", 1024], ["desktop1280", 1280], ["desktop", 1440]];
const widthCell = (route: string, viewport: string, lang: string): string => {
  const set = rows.filter((r) => r.route === route && r.viewport === viewport && r.lang === lang && r.check === "width invariants");
  if (!set.length) return "·";
  return set.every((r) => r.pass) ? "pass" : "FAIL";
};
md += `\n## Width assertions (v3.0)\n\nEvery route as the admin at six widths, in both languages: document.documentElement.scrollWidth equals window.innerWidth, no element is wider than the viewport (text cut by an ellipsis aside), and from 768px the header's scrollWidth equals its clientWidth. Any failure is a defect.\n\n| Route | ${WIDTHS.flatMap(([, w]) => ["en", "th"].map((l) => `${w} · ${l}`)).join(" | ")} |\n|---|${WIDTHS.flatMap(() => ["---", "---"]).join("|")}|\n`;
for (const route of routes.filter((r) => rows.some((x) => x.route === r && x.check === "width invariants"))) md += `| \`${route}\` | ${WIDTHS.flatMap(([v]) => ["en", "th"].map((l) => widthCell(route, v, l))).join(" | ")} |\n`;

md += `\n## Checks that failed\n\n`;
md += failed.length ? failed.map((r) => `- \`${r.route}\` · ${r.role} · ${r.viewport} · ${r.lang} · ${r.check}: ${r.note ?? ""}`).join("\n") + "\n" : "None.\n";

md += `\n## Defects found during the sweep and their fixes\n\n| # | Route | Found | Defect | Fix | Commit | Status |\n|---|---|---|---|---|---|---|\n`;
for (const d of defects) md += `| ${d.id} | \`${d.route}\` | ${d.found} | ${d.description} | ${d.fix} | \`${d.commit}\` | ${d.status} |\n`;

md += `\n## What is covered by Playwright\n\n`;
md += `- \`e2e/qa/matrix.spec.ts\`: every route as admin and contributor, EN and TH, at 375, 1024, 1280 and 1440px, with a screenshot each (\`qa-output/shots/\`).\n`;
md += `- \`e2e/qa/flows-admin.spec.ts\`: income form valid and invalid (lines that do not add up are refused with the difference), ledger and Reports move by the net amount, edit keeps gross and recomputes the unit price, soft delete and restore; quick entry with product chip and qty stepper; stock purchase with lines and backlog change; payout create, reconcile, confirm, edit and invalid; transfers valid and invalid; product create, edit, delete, restore; settings save; customers; units toggles; data health run; check books; audit export; sign out.\n`;
md += `- \`e2e/qa/flows-contributor.spec.ts\`: add and edit own sale, no Delete button, add a product but not edit one, read-only settings, denied on admin pages, read-only data health, quick entry.\n`;
md += `- \`e2e/qa/exports.spec.ts\`: every report's XLSX body compared cell for cell with the on-screen table, every PDF parsed and checked for its title and headline figure, units and download-everything exports.\n`;
md += `- \`e2e/qa/admin-edits-all.spec.ts\`: the contributor creates an income, an expense, a payout and a transfer; the admin opens, edits and soft-deletes each, and the ledger row reads created by Sai · edited by Mike.\n`;
md += `- \`e2e/qa/widths.spec.ts\`: every route at 375, 390, 768, 1024, 1280 and 1440px in EN and TH: no sideways scroll, no element wider than the viewport, the header never scrolls.\n`;
md += `- \`e2e/v30.spec.ts\`: header on one line at 1024 and 1440px, the More menu between 768 and 1024, the search overlay (icon, Ctrl K, grouped results, arrows, Enter, Esc), Products and Ledger with fixed layout and headers aligned to cells at 1024, 1280 and 1440px.\n`;
md += `- \`e2e/snapshots-375.spec.ts\`: 375px visual baselines of Reports and Stock, plus a check that no stat value overflows its tile.\n`;
md += `\n## Not automated\n\n- \`/import\` AI parsing (Gemini) is not called from tests; the page, its validation (empty input refused) and the review table are covered, the model call is exercised by hand.\n`;
md += `\n## Screenshots after fixing\n\n${shots.map((s) => `- \`qa-output/shots/${s}\``).join("\n")}\n`;

writeFileSync("QA-REPORT.md", md);
console.log(`QA-REPORT.md written: ${total} checks, ${failed.length} failing, ${defects.length} defects logged, ${shots.length} screenshots.`);
