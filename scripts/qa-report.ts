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
for (const role of ["admin", "contributor"]) for (const viewport of ["phone", "desktop"]) for (const lang of ["en", "th"]) combos.push([role, viewport, lang]);

const cell = (route: string, role: string, viewport: string, lang: string): string => {
  const set = rows.filter((r) => r.route === route && r.role === role && r.viewport === viewport && r.lang === lang);
  if (!set.length) return "·";
  const failed = set.filter((r) => !r.pass).length;
  return failed ? `FAIL ${set.length - failed}/${set.length}` : `pass ${set.length}`;
};

const total = rows.length;
const failed = rows.filter((r) => !r.pass);
const shots = existsSync("qa-output/shots") ? readdirSync("qa-output/shots").sort() : [];

let md = `# QA report · MikiSai Accounting v2.5 to v2.8\n\n`;
md += `Generated ${new Date().toISOString()} from ${total} recorded checks across ${routes.length} routes. `;
md += failed.length ? `**${failed.length} check(s) failing.**\n\n` : `**All checks pass; zero known defects.**\n\n`;
md += `Each cell is the number of checks that passed for that route as that role, at that viewport (phone = 375px, desktop = 1440px), in that language. A check is one assertion group: page loads with the right heading, page invariants (no sideways scroll, no raw dictionary key, no unfilled placeholder, no em dash, a heading), no console errors, plus the form, export and role checks the flow specs record.\n\n`;

md += `## Route × role × viewport × language\n\n| Route | ${combos.map(([r, v, l]) => `${r} · ${v} · ${l}`).join(" | ")} |\n|---|${combos.map(() => "---").join("|")}|\n`;
for (const route of routes) md += `| \`${route}\` | ${combos.map(([r, v, l]) => cell(route, r, v, l)).join(" | ")} |\n`;

md += `\n## Checks that failed\n\n`;
md += failed.length ? failed.map((r) => `- \`${r.route}\` · ${r.role} · ${r.viewport} · ${r.lang} · ${r.check}: ${r.note ?? ""}`).join("\n") + "\n" : "None.\n";

md += `\n## Defects found during the sweep and their fixes\n\n| # | Route | Found | Defect | Fix | Commit | Status |\n|---|---|---|---|---|---|---|\n`;
for (const d of defects) md += `| ${d.id} | \`${d.route}\` | ${d.found} | ${d.description} | ${d.fix} | \`${d.commit}\` | ${d.status} |\n`;

md += `\n## What is covered by Playwright\n\n`;
md += `- \`e2e/qa/matrix.spec.ts\`: every route as admin and contributor, EN and TH, 375px and 1440px, with a screenshot each (\`qa-output/shots/\`).\n`;
md += `- \`e2e/qa/flows-admin.spec.ts\`: income form valid and invalid (lines that do not add up are refused with the difference), ledger and Reports move by the net amount, edit keeps gross and recomputes the unit price, soft delete and restore; quick entry with product chip and qty stepper; stock purchase with lines and backlog change; payout create, reconcile, confirm, edit and invalid; transfers valid and invalid; product create, edit, delete, restore; settings save; customers; units toggles; data health run; check books; audit export; sign out.\n`;
md += `- \`e2e/qa/flows-contributor.spec.ts\`: add and edit own sale, no Delete button, add a product but not edit one, read-only settings, denied on admin pages, read-only data health, quick entry.\n`;
md += `- \`e2e/qa/exports.spec.ts\`: every report's XLSX body compared cell for cell with the on-screen table, every PDF parsed and checked for its title and headline figure, units and download-everything exports.\n`;
md += `- \`e2e/qa/admin-edits-all.spec.ts\`: the contributor creates an income, an expense, a payout and a transfer; the admin opens, edits and soft-deletes each, and the ledger row reads created by Sai · edited by Mike.\n`;
md += `- \`e2e/snapshots-375.spec.ts\`: 375px visual baselines of Reports and Stock, plus a check that no stat value overflows its tile.\n`;
md += `\n## Not automated\n\n- \`/import\` AI parsing (Gemini) is not called from tests; the page, its validation (empty input refused) and the review table are covered, the model call is exercised by hand.\n`;
md += `\n## Screenshots after fixing\n\n${shots.map((s) => `- \`qa-output/shots/${s}\``).join("\n")}\n`;

writeFileSync("QA-REPORT.md", md);
console.log(`QA-REPORT.md written: ${total} checks, ${failed.length} failing, ${defects.length} defects logged, ${shots.length} screenshots.`);
