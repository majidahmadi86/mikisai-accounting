# QA report · MikiSai Accounting v2.5 to v3.0

Generated 2026-09-21T04:11:40.330Z from 1305 recorded checks across 32 routes. **All checks pass; 1 defect(s) still open, listed below.**

Each cell is the number of checks that passed for that route as that role, at that viewport (phone = 375px, laptop = 1024px, desktop1280 = 1280px, desktop = 1440px), in that language. A check is one assertion group: page loads with the right heading, page invariants (document scrollWidth equals window.innerWidth, no element wider than the viewport, header scrollWidth equals clientWidth from 768px, no raw dictionary key, no unfilled placeholder, no em dash, a heading), no console errors, plus the form, export and role checks the flow specs record.

## Route × role × viewport × language

| Route | admin · phone · en | admin · phone · th | admin · laptop · en | admin · laptop · th | admin · desktop1280 · en | admin · desktop1280 · th | admin · desktop · en | admin · desktop · th | contributor · phone · en | contributor · phone · th | contributor · laptop · en | contributor · laptop · th | contributor · desktop1280 · en | contributor · desktop1280 · th | contributor · desktop · en | contributor · desktop · th |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/ (routine card)` | · | · | · | · | · | · | · | · | pass 1 | · | · | · | · | · | · | · |
| `/audit` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 5 | pass 4 | pass 2 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 |
| `/balance` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/customers` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 5 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/import` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/insights` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/investment` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/login` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 |
| `/more` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 5 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/more/check-books` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 5 | pass 4 | pass 2 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 |
| `/more/deleted` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 2 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 |
| `/more/health` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 5 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/payouts` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/payouts/[id]/edit` | · | · | · | · | · | · | pass 2 | · | · | · | · | · | · | · | · | · |
| `/payouts/[id]/reconcile` | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 2 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 |
| `/products` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/products/[id]` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 5 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/products/[id]/edit` | · | · | · | · | · | · | pass 1 | · | pass 1 | · | · | · | · | · | · | · |
| `/products/new` | · | · | · | · | · | · | pass 2 | · | pass 1 | · | · | · | · | · | · | · |
| `/reports` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 34 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/reports/units` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 6 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/settings` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 5 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/stock` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/transactions` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 5 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/transactions/[id]/edit` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 9 | pass 4 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/transfers/[id]/edit` | · | · | · | · | · | · | pass 1 | · | · | · | · | · | · | · | · | · |
| `Add · Expense` | · | · | · | · | · | · | pass 3 | · | · | · | · | · | · | · | · | · |
| `Add · Expense (stock purchase)` | · | · | · | · | · | · | pass 2 | · | · | · | · | · | · | · | · | · |
| `Add · Money moved` | · | · | · | · | · | · | pass 2 | · | · | · | · | · | · | · | · | · |
| `Add · Payout received` | · | · | · | · | · | · | pass 2 | · | · | · | · | · | · | · | · | · |
| `Add · Sale` | · | · | · | · | · | · | pass 2 | · | pass 1 | · | · | · | · | · | · | · |

## Width assertions (v3.0)

Every route as the admin at six widths, in both languages: document.documentElement.scrollWidth equals window.innerWidth, no element is wider than the viewport (text cut by an ellipsis aside), and from 768px the header's scrollWidth equals its clientWidth. Any failure is a defect.

| Route | 375 · en | 375 · th | 390 · en | 390 · th | 768 · en | 768 · th | 1024 · en | 1024 · th | 1280 · en | 1280 · th | 1440 · en | 1440 · th |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/audit` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/balance` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/customers` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/import` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/insights` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/investment` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/more` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/more/check-books` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/more/deleted` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/more/health` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/payouts` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/products` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/products/[id]` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/reports` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/reports/units` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/settings` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/stock` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/transactions` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `/transactions/[id]/edit` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |

## Checks that failed

None.

## Defects found during the sweep and their fixes

| # | Route | Found | Defect | Fix | Commit | Status |
|---|---|---|---|---|---|---|
| D1 | `/transactions (data)` | reconcile:items dry run on live data | Four sales of 15 Sept had lines worth twice their gross (qty was raised to 2 while the per-unit price stayed at the whole amount), so Units and profitability double counted them. | Invariant lines = gross enforced in the RPC and server actions; reconcile:items --fix set unit price = gross / qty on the four rows and logged a system correction to audit_log. | `3474168` | fixed |
| D2 | `/reports, /` | flows-admin: reports revenue moved by the net amount | After saving an entry, Reports and Home kept the old numbers for up to 60 seconds: updateTag does not expire unstable_cache entries, so the ledger snapshot only refreshed on its safety-net timer. | ledgerChanged now calls revalidateTag(tag, "max") as well as updateTag. | `0bebce6` | fixed |
| D3 | `/transactions` | flows-admin: ledger shows the row | Ledger rows did not show the note, so an order id or a reference could not be found in the list. | Note shown as a clamped line under the customer or category on both layouts. | `3536118` | fixed |
| D4 | `/more/data-health, /more/recently-deleted, /more/audit` | matrix: route names from the brief | The names people reach for did not resolve; the pages live at /more/health, /more/deleted and /audit. | Redirects added in next.config.ts. | `9e25ca8` | fixed |
| D5 | `/reports/units` | v2.4 screenshots at 375px | Long product names in the phone cards ran into the next label; period labels wrapped. | Units table rebuilt with short single-line period labels, sticky period and product columns and horizontal scroll inside the card. | `fba6fb0` | fixed |
| D6 | `/transactions/new, /transactions/[id]/edit` | brief item 1 | Editing quantity on a single-line sale left the unit price unchanged, so lines disagreed with the gross. | Amount and lines are linked: qty change keeps gross and recomputes the unit price, price change recomputes gross; line totals shown; server refuses mismatches with the difference. | `3474168` | fixed |
| D7 | `every route (local production preview)` | matrix: no console errors, 156 visits | The CSP sent upgrade-insecure-requests on plain http too, so on a local production preview every subresource was upgraded to https://localhost and failed with ERR_SSL_PROTOCOL_ERROR in the console. Live (https) was unaffected. | The upgrade directive is emitted only when the request is https (URL protocol or x-forwarded-proto). | `63cd972` | fixed |
| D8 | `/transactions/new?type=expense` | flows-admin: stock purchase with lines | With the amount still empty, choosing a product or quantity on a stock purchase (and on a sale) set the unit cost to zero instead of prefilling the amount from the standard cost times units, as v2.3 promised. | With no amount yet the line's standard price or cost prefills the amount; once an amount exists the line follows it. | `ea62c11` | fixed |
| D9 | `/payouts/[id]/reconcile (QA harness)` | flows-admin: payout confirm | The QA payout probe confirmed the reconciliation proposal, which ticks the oldest waiting orders, so two of Mike's real 15 Sept orders (net 301.03 and 310.82) were marked received in bank by test payouts. | Both settlements were restored to pending with no payout; the spec now names the probe customer and ticks only the probe row before confirming, so a real order can never be touched. | `dc3ae87` | fixed |
| D10 | `every route at 1440px; /stock at 375px` | v2.6 screenshots | With Stock added to the header the wordmark, Add button, language toggle and Sign out wrapped onto two lines at 1440px; on phones the Purchase backlog pill on a Stock card was clipped by the card edge. | Header right-hand group never wraps and never shrinks, the link row scrolls if it must, the signed-in label waits for xl; Stock card headers wrap the pill under the title when tight. | `426a825` | fixed |
| D11 | `/audit` | v2.8 QA sweep (matrix invariants) | Audit rows written for system corrections (transfer reason, purchase product, orphan cleanup) rendered the raw key audit.entity.system_correction. | Entity label added in EN and TH. | `596be74` | fixed |
| D12 | `/ (quick order sheet)` | v2.8 screenshots at 375px | In quick-order mode the income form's sticky Save / Save and add another footer stayed visible under the order form. | The footer hides in order mode like it does in transfer mode. | `4e1ad07` | fixed |
| D13 | `/search, /transactions (phone cards)` | v2.8 cancel flow test | Mark cancelled opened its form inside the row link, and the form's click handler prevented the default of every click, so Cancel this order never submitted. | The status control renders below the row link and only stops propagation; submit is prevented in the submit handler alone. | `4e1ad07` | fixed |
| D14 | `every route at 1440px` | v2.9-CSV screenshots | The header search input added in v2.8 squeezed the link row at 1440px so Reports was clipped and Insights and More scrolled out of view. | The input shows from 2xl; below that a search icon opens the Search page. | `32ff05e` | fixed |
| D15 | `every route from 768px` | v3.0 width assertions | The header nav was a sideways-scrolling strip: at 1024px the eight links plus the controls needed about 1050px of a 976px row, so the nav's scrollWidth exceeded its clientWidth. | Search input removed for an overlay button, wordmark steps aside below 1280px, Insights, More, language and sign out fold into a More menu between 768 and 1024px. | `c6c1ce9` | fixed |
| D16 | `/products` | founder review, 20 Sept | Full product names wrapped to five lines and the Details link was clipped at the right edge. | Short name and variant on one line, full name in the row detail and on hover, Details as a 44px icon; fixed column widths. | `e4a9860` | fixed |
| D17 | `/transactions, /search` | founder review, 20 Sept | At 1440px the product cell wrapped and the customer cell carried the TikTok product text and the byline. | Product on one line, buyer name only; note, byline and Mark cancelled in the row detail. | `c25ea34` | fixed |
| D18 | `/reports/units` | v3.0 width assertions | The Units table and the per-product strip scrolled sideways inside the card at every width. | Column priorities and cards below 1024px; the strip wraps. | `f7090d9` | fixed |
| D19 | `/import` | v3.0 width assertions | The thirteen-column editable review table and the nightly ready rows (min-width 640px) scrolled sideways. | Review is one editable card per order at every width; ready rows follow the table rule with cards below 1024px. | `c576fbe` | fixed |
| D20 | `/more/health` | v3.0 QA sweep | While the sweep's probe rows were being removed through the service role (which does not expire the app's ledger cache), Data health briefly listed report-total mismatches whose labels are internal ids such as units.sold, and the no-raw-key check flagged them. It passes on a clean ledger (rerun: 16 of 16). | None yet: a test artefact, but the ids are not plain words. Candidate for the next directive: translate the report-total labels. | `` | open (transient, test data only) |
| D21 | `Add · Sale` | v3.0 revised, payout flow spec | Expenses saved from the new Expense sheet carry no platform, and the sheet took its default platform from the last row, so a new sale could start on Other and never show up when matching a TikTok payout. | The default platform comes from the last sale. | `6877fe6` | fixed |
| D22 | `/reports at 375 and 390px` | v3.0 revised QA sweep | The plain-word column label Profit before other costs was wider than its phone card and pushed past the screen. | Labels wrap inside the card; the value keeps its width. | `64b4d19` | fixed |
| D23 | `/ and /balance` | v3.0 revised, while executing the audit | Removing Home's transfers list would have left transfers sent as profit share with no page listing them, so they could not be opened or edited. | My Balance lists every Money moved entry, each opening its edit page. | `022a802` | fixed |

## What is covered by Playwright

- `e2e/qa/matrix.spec.ts`: every route as admin and contributor, EN and TH, at 375, 1024, 1280 and 1440px, with a screenshot each (`qa-output/shots/`).
- `e2e/qa/flows-admin.spec.ts`: the one entry door: Sale valid and invalid (no order ID is refused), ledger and Reports move by what you receive, edit keeps the customer-paid amount and recomputes the unit price, soft delete and restore; Expense with Stock purchase and Samples first, an amount that does not match units times cost refused by the server, backlog change; Payout received, matching, confirm, edit and invalid; Money moved valid and invalid; product create, edit, delete, restore; settings save; customers; units toggles; data health run; check books; audit export; sign out.
- `e2e/qa/flows-contributor.spec.ts`: add a sale through Add and edit it, no Delete button, add a product but not edit one, read-only settings, denied on admin pages, read-only data health, Record what you paid for from Home.
- `e2e/qa/exports.spec.ts`: every report's XLSX body compared cell for cell with the on-screen table, every PDF parsed and checked for its title and headline figure, units and download-everything exports.
- `e2e/qa/admin-edits-all.spec.ts`: the contributor creates an income, an expense, a payout and a transfer; the admin opens, edits and soft-deletes each, and the ledger row reads created by Sai · edited by Mike.
- `e2e/qa/widths.spec.ts`: every route at 375, 390, 768, 1024, 1280 and 1440px in EN and TH: no sideways scroll, no element wider than the viewport, the header never scrolls.
- `e2e/v30.spec.ts`: header on one line at 1024 and 1440px, the More menu between 768 and 1024, the search overlay (icon, Ctrl K, grouped results, arrows, Enter, Esc), Products and Ledger with fixed layout and headers aligned to cells at 1024, 1280 and 1440px.
- `e2e/snapshots-375.spec.ts`: 375px visual baselines of Reports and Stock, plus a check that no stat value overflows its tile.

## Not automated

- `/import` AI parsing (Gemini) is not called from tests; the page, its validation (empty input refused) and the review table are covered, the model call is exercised by hand.

## Screenshots after fixing

- `qa-output/shots/add-sale-invalid__admin__desktop__en.png`
- `qa-output/shots/audit__admin__desktop1280__en.png`
- `qa-output/shots/audit__admin__desktop1280__th.png`
- `qa-output/shots/audit__admin__desktop__en.png`
- `qa-output/shots/audit__admin__desktop__th.png`
- `qa-output/shots/audit__admin__laptop__en.png`
- `qa-output/shots/audit__admin__laptop__th.png`
- `qa-output/shots/audit__admin__phone__en.png`
- `qa-output/shots/audit__admin__phone__th.png`
- `qa-output/shots/audit__contributor__desktop1280__en.png`
- `qa-output/shots/audit__contributor__desktop1280__th.png`
- `qa-output/shots/audit__contributor__desktop__en.png`
- `qa-output/shots/audit__contributor__desktop__th.png`
- `qa-output/shots/audit__contributor__laptop__en.png`
- `qa-output/shots/audit__contributor__laptop__th.png`
- `qa-output/shots/audit__contributor__phone__en.png`
- `qa-output/shots/audit__contributor__phone__th.png`
- `qa-output/shots/balance__admin__desktop1280__en.png`
- `qa-output/shots/balance__admin__desktop1280__th.png`
- `qa-output/shots/balance__admin__desktop__en.png`
- `qa-output/shots/balance__admin__desktop__th.png`
- `qa-output/shots/balance__admin__laptop__en.png`
- `qa-output/shots/balance__admin__laptop__th.png`
- `qa-output/shots/balance__admin__phone__en.png`
- `qa-output/shots/balance__admin__phone__th.png`
- `qa-output/shots/balance__contributor__desktop1280__en.png`
- `qa-output/shots/balance__contributor__desktop1280__th.png`
- `qa-output/shots/balance__contributor__desktop__en.png`
- `qa-output/shots/balance__contributor__desktop__th.png`
- `qa-output/shots/balance__contributor__laptop__en.png`
- `qa-output/shots/balance__contributor__laptop__th.png`
- `qa-output/shots/balance__contributor__phone__en.png`
- `qa-output/shots/balance__contributor__phone__th.png`
- `qa-output/shots/customers__admin__desktop1280__en.png`
- `qa-output/shots/customers__admin__desktop1280__th.png`
- `qa-output/shots/customers__admin__desktop__en.png`
- `qa-output/shots/customers__admin__desktop__th.png`
- `qa-output/shots/customers__admin__laptop__en.png`
- `qa-output/shots/customers__admin__laptop__th.png`
- `qa-output/shots/customers__admin__phone__en.png`
- `qa-output/shots/customers__admin__phone__th.png`
- `qa-output/shots/customers__contributor__desktop1280__en.png`
- `qa-output/shots/customers__contributor__desktop1280__th.png`
- `qa-output/shots/customers__contributor__desktop__en.png`
- `qa-output/shots/customers__contributor__desktop__th.png`
- `qa-output/shots/customers__contributor__laptop__en.png`
- `qa-output/shots/customers__contributor__laptop__th.png`
- `qa-output/shots/customers__contributor__phone__en.png`
- `qa-output/shots/customers__contributor__phone__th.png`
- `qa-output/shots/home__admin__desktop1280__en.png`
- `qa-output/shots/home__admin__desktop1280__th.png`
- `qa-output/shots/home__admin__desktop__en.png`
- `qa-output/shots/home__admin__desktop__th.png`
- `qa-output/shots/home__admin__laptop__en.png`
- `qa-output/shots/home__admin__laptop__th.png`
- `qa-output/shots/home__admin__phone__en.png`
- `qa-output/shots/home__admin__phone__th.png`
- `qa-output/shots/home__contributor__desktop1280__en.png`
- `qa-output/shots/home__contributor__desktop1280__th.png`
- `qa-output/shots/home__contributor__desktop__en.png`
- `qa-output/shots/home__contributor__desktop__th.png`
- `qa-output/shots/home__contributor__laptop__en.png`
- `qa-output/shots/home__contributor__laptop__th.png`
- `qa-output/shots/home__contributor__phone__en.png`
- `qa-output/shots/home__contributor__phone__th.png`
- `qa-output/shots/import__admin__desktop1280__en.png`
- `qa-output/shots/import__admin__desktop1280__th.png`
- `qa-output/shots/import__admin__desktop__en.png`
- `qa-output/shots/import__admin__desktop__th.png`
- `qa-output/shots/import__admin__laptop__en.png`
- `qa-output/shots/import__admin__laptop__th.png`
- `qa-output/shots/import__admin__phone__en.png`
- `qa-output/shots/import__admin__phone__th.png`
- `qa-output/shots/import__contributor__desktop1280__en.png`
- `qa-output/shots/import__contributor__desktop1280__th.png`
- `qa-output/shots/import__contributor__desktop__en.png`
- `qa-output/shots/import__contributor__desktop__th.png`
- `qa-output/shots/import__contributor__laptop__en.png`
- `qa-output/shots/import__contributor__laptop__th.png`
- `qa-output/shots/import__contributor__phone__en.png`
- `qa-output/shots/import__contributor__phone__th.png`
- `qa-output/shots/insights__admin__desktop1280__en.png`
- `qa-output/shots/insights__admin__desktop1280__th.png`
- `qa-output/shots/insights__admin__desktop__en.png`
- `qa-output/shots/insights__admin__desktop__th.png`
- `qa-output/shots/insights__admin__laptop__en.png`
- `qa-output/shots/insights__admin__laptop__th.png`
- `qa-output/shots/insights__admin__phone__en.png`
- `qa-output/shots/insights__admin__phone__th.png`
- `qa-output/shots/insights__contributor__desktop1280__en.png`
- `qa-output/shots/insights__contributor__desktop1280__th.png`
- `qa-output/shots/insights__contributor__desktop__en.png`
- `qa-output/shots/insights__contributor__desktop__th.png`
- `qa-output/shots/insights__contributor__laptop__en.png`
- `qa-output/shots/insights__contributor__laptop__th.png`
- `qa-output/shots/insights__contributor__phone__en.png`
- `qa-output/shots/insights__contributor__phone__th.png`
- `qa-output/shots/investment__admin__desktop1280__en.png`
- `qa-output/shots/investment__admin__desktop1280__th.png`
- `qa-output/shots/investment__admin__desktop__en.png`
- `qa-output/shots/investment__admin__desktop__th.png`
- `qa-output/shots/investment__admin__laptop__en.png`
- `qa-output/shots/investment__admin__laptop__th.png`
- `qa-output/shots/investment__admin__phone__en.png`
- `qa-output/shots/investment__admin__phone__th.png`
- `qa-output/shots/investment__contributor__desktop1280__en.png`
- `qa-output/shots/investment__contributor__desktop1280__th.png`
- `qa-output/shots/investment__contributor__desktop__en.png`
- `qa-output/shots/investment__contributor__desktop__th.png`
- `qa-output/shots/investment__contributor__laptop__en.png`
- `qa-output/shots/investment__contributor__laptop__th.png`
- `qa-output/shots/investment__contributor__phone__en.png`
- `qa-output/shots/investment__contributor__phone__th.png`
- `qa-output/shots/login__admin__desktop1280__en.png`
- `qa-output/shots/login__admin__desktop1280__th.png`
- `qa-output/shots/login__admin__desktop__en.png`
- `qa-output/shots/login__admin__desktop__th.png`
- `qa-output/shots/login__admin__laptop__en.png`
- `qa-output/shots/login__admin__laptop__th.png`
- `qa-output/shots/login__admin__phone__en.png`
- `qa-output/shots/login__admin__phone__th.png`
- `qa-output/shots/login__contributor__desktop1280__en.png`
- `qa-output/shots/login__contributor__desktop1280__th.png`
- `qa-output/shots/login__contributor__desktop__en.png`
- `qa-output/shots/login__contributor__desktop__th.png`
- `qa-output/shots/login__contributor__laptop__en.png`
- `qa-output/shots/login__contributor__laptop__th.png`
- `qa-output/shots/login__contributor__phone__en.png`
- `qa-output/shots/login__contributor__phone__th.png`
- `qa-output/shots/more-check-books__admin__desktop1280__en.png`
- `qa-output/shots/more-check-books__admin__desktop1280__th.png`
- `qa-output/shots/more-check-books__admin__desktop__en.png`
- `qa-output/shots/more-check-books__admin__desktop__th.png`
- `qa-output/shots/more-check-books__admin__laptop__en.png`
- `qa-output/shots/more-check-books__admin__laptop__th.png`
- `qa-output/shots/more-check-books__admin__phone__en.png`
- `qa-output/shots/more-check-books__admin__phone__th.png`
- `qa-output/shots/more-check-books__contributor__desktop1280__en.png`
- `qa-output/shots/more-check-books__contributor__desktop1280__th.png`
- `qa-output/shots/more-check-books__contributor__desktop__en.png`
- `qa-output/shots/more-check-books__contributor__desktop__th.png`
- `qa-output/shots/more-check-books__contributor__laptop__en.png`
- `qa-output/shots/more-check-books__contributor__laptop__th.png`
- `qa-output/shots/more-check-books__contributor__phone__en.png`
- `qa-output/shots/more-check-books__contributor__phone__th.png`
- `qa-output/shots/more-deleted__admin__desktop1280__en.png`
- `qa-output/shots/more-deleted__admin__desktop1280__th.png`
- `qa-output/shots/more-deleted__admin__desktop__en.png`
- `qa-output/shots/more-deleted__admin__desktop__th.png`
- `qa-output/shots/more-deleted__admin__laptop__en.png`
- `qa-output/shots/more-deleted__admin__laptop__th.png`
- `qa-output/shots/more-deleted__admin__phone__en.png`
- `qa-output/shots/more-deleted__admin__phone__th.png`
- `qa-output/shots/more-deleted__contributor__desktop1280__en.png`
- `qa-output/shots/more-deleted__contributor__desktop1280__th.png`
- `qa-output/shots/more-deleted__contributor__desktop__en.png`
- `qa-output/shots/more-deleted__contributor__desktop__th.png`
- `qa-output/shots/more-deleted__contributor__laptop__en.png`
- `qa-output/shots/more-deleted__contributor__laptop__th.png`
- `qa-output/shots/more-deleted__contributor__phone__en.png`
- `qa-output/shots/more-deleted__contributor__phone__th.png`
- `qa-output/shots/more-health__admin__desktop1280__en.png`
- `qa-output/shots/more-health__admin__desktop1280__th.png`
- `qa-output/shots/more-health__admin__desktop__en.png`
- `qa-output/shots/more-health__admin__desktop__th.png`
- `qa-output/shots/more-health__admin__laptop__en.png`
- `qa-output/shots/more-health__admin__laptop__th.png`
- `qa-output/shots/more-health__admin__phone__en.png`
- `qa-output/shots/more-health__admin__phone__th.png`
- `qa-output/shots/more-health__contributor__desktop1280__en.png`
- `qa-output/shots/more-health__contributor__desktop1280__th.png`
- `qa-output/shots/more-health__contributor__desktop__en.png`
- `qa-output/shots/more-health__contributor__desktop__th.png`
- `qa-output/shots/more-health__contributor__laptop__en.png`
- `qa-output/shots/more-health__contributor__laptop__th.png`
- `qa-output/shots/more-health__contributor__phone__en.png`
- `qa-output/shots/more-health__contributor__phone__th.png`
- `qa-output/shots/more__admin__desktop1280__en.png`
- `qa-output/shots/more__admin__desktop1280__th.png`
- `qa-output/shots/more__admin__desktop__en.png`
- `qa-output/shots/more__admin__desktop__th.png`
- `qa-output/shots/more__admin__laptop__en.png`
- `qa-output/shots/more__admin__laptop__th.png`
- `qa-output/shots/more__admin__phone__en.png`
- `qa-output/shots/more__admin__phone__th.png`
- `qa-output/shots/more__contributor__desktop1280__en.png`
- `qa-output/shots/more__contributor__desktop1280__th.png`
- `qa-output/shots/more__contributor__desktop__en.png`
- `qa-output/shots/more__contributor__desktop__th.png`
- `qa-output/shots/more__contributor__laptop__en.png`
- `qa-output/shots/more__contributor__laptop__th.png`
- `qa-output/shots/more__contributor__phone__en.png`
- `qa-output/shots/more__contributor__phone__th.png`
- `qa-output/shots/payouts-id-reconcile__admin__desktop__en.png`
- `qa-output/shots/payouts-new__admin__desktop1280__en.png`
- `qa-output/shots/payouts-new__admin__desktop1280__th.png`
- `qa-output/shots/payouts-new__admin__desktop__en.png`
- `qa-output/shots/payouts-new__admin__desktop__th.png`
- `qa-output/shots/payouts-new__admin__laptop__en.png`
- `qa-output/shots/payouts-new__admin__laptop__th.png`
- `qa-output/shots/payouts-new__admin__phone__en.png`
- `qa-output/shots/payouts-new__admin__phone__th.png`
- `qa-output/shots/payouts-new__contributor__desktop1280__en.png`
- `qa-output/shots/payouts-new__contributor__desktop1280__th.png`
- `qa-output/shots/payouts-new__contributor__desktop__en.png`
- `qa-output/shots/payouts-new__contributor__desktop__th.png`
- `qa-output/shots/payouts-new__contributor__laptop__en.png`
- `qa-output/shots/payouts-new__contributor__laptop__th.png`
- `qa-output/shots/payouts-new__contributor__phone__en.png`
- `qa-output/shots/payouts-new__contributor__phone__th.png`
- `qa-output/shots/payouts__admin__desktop1280__en.png`
- `qa-output/shots/payouts__admin__desktop1280__th.png`
- `qa-output/shots/payouts__admin__desktop__en.png`
- `qa-output/shots/payouts__admin__desktop__th.png`
- `qa-output/shots/payouts__admin__laptop__en.png`
- `qa-output/shots/payouts__admin__laptop__th.png`
- `qa-output/shots/payouts__admin__phone__en.png`
- `qa-output/shots/payouts__admin__phone__th.png`
- `qa-output/shots/payouts__contributor__desktop1280__en.png`
- `qa-output/shots/payouts__contributor__desktop1280__th.png`
- `qa-output/shots/payouts__contributor__desktop__en.png`
- `qa-output/shots/payouts__contributor__desktop__th.png`
- `qa-output/shots/payouts__contributor__laptop__en.png`
- `qa-output/shots/payouts__contributor__laptop__th.png`
- `qa-output/shots/payouts__contributor__phone__en.png`
- `qa-output/shots/payouts__contributor__phone__th.png`
- `qa-output/shots/products-id-__admin__desktop1280__en.png`
- `qa-output/shots/products-id-__admin__desktop1280__th.png`
- `qa-output/shots/products-id-__admin__desktop__en.png`
- `qa-output/shots/products-id-__admin__desktop__th.png`
- `qa-output/shots/products-id-__admin__laptop__en.png`
- `qa-output/shots/products-id-__admin__laptop__th.png`
- `qa-output/shots/products-id-__admin__phone__en.png`
- `qa-output/shots/products-id-__admin__phone__th.png`
- `qa-output/shots/products-id-__contributor__desktop1280__en.png`
- `qa-output/shots/products-id-__contributor__desktop1280__th.png`
- `qa-output/shots/products-id-__contributor__desktop__en.png`
- `qa-output/shots/products-id-__contributor__desktop__th.png`
- `qa-output/shots/products-id-__contributor__laptop__en.png`
- `qa-output/shots/products-id-__contributor__laptop__th.png`
- `qa-output/shots/products-id-__contributor__phone__en.png`
- `qa-output/shots/products-id-__contributor__phone__th.png`
- `qa-output/shots/products__admin__desktop1280__en.png`
- `qa-output/shots/products__admin__desktop1280__th.png`
- `qa-output/shots/products__admin__desktop__en.png`
- `qa-output/shots/products__admin__desktop__th.png`
- `qa-output/shots/products__admin__laptop__en.png`
- `qa-output/shots/products__admin__laptop__th.png`
- `qa-output/shots/products__admin__phone__en.png`
- `qa-output/shots/products__admin__phone__th.png`
- `qa-output/shots/products__contributor__desktop1280__en.png`
- `qa-output/shots/products__contributor__desktop1280__th.png`
- `qa-output/shots/products__contributor__desktop__en.png`
- `qa-output/shots/products__contributor__desktop__th.png`
- `qa-output/shots/products__contributor__laptop__en.png`
- `qa-output/shots/products__contributor__laptop__th.png`
- `qa-output/shots/products__contributor__phone__en.png`
- `qa-output/shots/products__contributor__phone__th.png`
- `qa-output/shots/reports-units__admin__desktop1280__en.png`
- `qa-output/shots/reports-units__admin__desktop1280__th.png`
- `qa-output/shots/reports-units__admin__desktop__en.png`
- `qa-output/shots/reports-units__admin__desktop__th.png`
- `qa-output/shots/reports-units__admin__laptop__en.png`
- `qa-output/shots/reports-units__admin__laptop__th.png`
- `qa-output/shots/reports-units__admin__phone__en.png`
- `qa-output/shots/reports-units__admin__phone__th.png`
- `qa-output/shots/reports-units__contributor__desktop1280__en.png`
- `qa-output/shots/reports-units__contributor__desktop1280__th.png`
- `qa-output/shots/reports-units__contributor__desktop__en.png`
- `qa-output/shots/reports-units__contributor__desktop__th.png`
- `qa-output/shots/reports-units__contributor__laptop__en.png`
- `qa-output/shots/reports-units__contributor__laptop__th.png`
- `qa-output/shots/reports-units__contributor__phone__en.png`
- `qa-output/shots/reports-units__contributor__phone__th.png`
- `qa-output/shots/reports__admin__desktop1280__en.png`
- `qa-output/shots/reports__admin__desktop1280__th.png`
- `qa-output/shots/reports__admin__desktop__en.png`
- `qa-output/shots/reports__admin__desktop__th.png`
- `qa-output/shots/reports__admin__laptop__en.png`
- `qa-output/shots/reports__admin__laptop__th.png`
- `qa-output/shots/reports__admin__phone__en.png`
- `qa-output/shots/reports__admin__phone__th.png`
- `qa-output/shots/reports__contributor__desktop1280__en.png`
- `qa-output/shots/reports__contributor__desktop1280__th.png`
- `qa-output/shots/reports__contributor__desktop__en.png`
- `qa-output/shots/reports__contributor__desktop__th.png`
- `qa-output/shots/reports__contributor__laptop__en.png`
- `qa-output/shots/reports__contributor__laptop__th.png`
- `qa-output/shots/reports__contributor__phone__en.png`
- `qa-output/shots/reports__contributor__phone__th.png`
- `qa-output/shots/settings__admin__desktop1280__en.png`
- `qa-output/shots/settings__admin__desktop1280__th.png`
- `qa-output/shots/settings__admin__desktop__en.png`
- `qa-output/shots/settings__admin__desktop__th.png`
- `qa-output/shots/settings__admin__laptop__en.png`
- `qa-output/shots/settings__admin__laptop__th.png`
- `qa-output/shots/settings__admin__phone__en.png`
- `qa-output/shots/settings__admin__phone__th.png`
- `qa-output/shots/settings__contributor__desktop1280__en.png`
- `qa-output/shots/settings__contributor__desktop1280__th.png`
- `qa-output/shots/settings__contributor__desktop__en.png`
- `qa-output/shots/settings__contributor__desktop__th.png`
- `qa-output/shots/settings__contributor__laptop__en.png`
- `qa-output/shots/settings__contributor__laptop__th.png`
- `qa-output/shots/settings__contributor__phone__en.png`
- `qa-output/shots/settings__contributor__phone__th.png`
- `qa-output/shots/stock__admin__desktop1280__en.png`
- `qa-output/shots/stock__admin__desktop1280__th.png`
- `qa-output/shots/stock__admin__desktop__en.png`
- `qa-output/shots/stock__admin__desktop__th.png`
- `qa-output/shots/stock__admin__laptop__en.png`
- `qa-output/shots/stock__admin__laptop__th.png`
- `qa-output/shots/stock__admin__phone__en.png`
- `qa-output/shots/stock__admin__phone__th.png`
- `qa-output/shots/stock__contributor__desktop1280__en.png`
- `qa-output/shots/stock__contributor__desktop1280__th.png`
- `qa-output/shots/stock__contributor__desktop__en.png`
- `qa-output/shots/stock__contributor__desktop__th.png`
- `qa-output/shots/stock__contributor__laptop__en.png`
- `qa-output/shots/stock__contributor__laptop__th.png`
- `qa-output/shots/stock__contributor__phone__en.png`
- `qa-output/shots/stock__contributor__phone__th.png`
- `qa-output/shots/transactions-after-save__admin__desktop__en.png`
- `qa-output/shots/transactions-after-save__contributor__phone__en.png`
- `qa-output/shots/transactions-id-edit-after__admin__desktop__en.png`
- `qa-output/shots/transactions-id-edit__admin__desktop1280__en.png`
- `qa-output/shots/transactions-id-edit__admin__desktop1280__th.png`
- `qa-output/shots/transactions-id-edit__admin__desktop__en.png`
- `qa-output/shots/transactions-id-edit__admin__desktop__th.png`
- `qa-output/shots/transactions-id-edit__admin__laptop__en.png`
- `qa-output/shots/transactions-id-edit__admin__laptop__th.png`
- `qa-output/shots/transactions-id-edit__admin__phone__en.png`
- `qa-output/shots/transactions-id-edit__admin__phone__th.png`
- `qa-output/shots/transactions-id-edit__contributor__desktop1280__en.png`
- `qa-output/shots/transactions-id-edit__contributor__desktop1280__th.png`
- `qa-output/shots/transactions-id-edit__contributor__desktop__en.png`
- `qa-output/shots/transactions-id-edit__contributor__desktop__th.png`
- `qa-output/shots/transactions-id-edit__contributor__laptop__en.png`
- `qa-output/shots/transactions-id-edit__contributor__laptop__th.png`
- `qa-output/shots/transactions-id-edit__contributor__phone__en.png`
- `qa-output/shots/transactions-id-edit__contributor__phone__th.png`
- `qa-output/shots/transactions-new-invalid__admin__desktop__en.png`
- `qa-output/shots/transactions-new__admin__desktop1280__en.png`
- `qa-output/shots/transactions-new__admin__desktop1280__th.png`
- `qa-output/shots/transactions-new__admin__desktop__en.png`
- `qa-output/shots/transactions-new__admin__desktop__th.png`
- `qa-output/shots/transactions-new__admin__laptop__en.png`
- `qa-output/shots/transactions-new__admin__laptop__th.png`
- `qa-output/shots/transactions-new__admin__phone__en.png`
- `qa-output/shots/transactions-new__admin__phone__th.png`
- `qa-output/shots/transactions-new__contributor__desktop1280__en.png`
- `qa-output/shots/transactions-new__contributor__desktop1280__th.png`
- `qa-output/shots/transactions-new__contributor__desktop__en.png`
- `qa-output/shots/transactions-new__contributor__desktop__th.png`
- `qa-output/shots/transactions-new__contributor__laptop__en.png`
- `qa-output/shots/transactions-new__contributor__laptop__th.png`
- `qa-output/shots/transactions-new__contributor__phone__en.png`
- `qa-output/shots/transactions-new__contributor__phone__th.png`
- `qa-output/shots/transactions__admin__desktop1280__en.png`
- `qa-output/shots/transactions__admin__desktop1280__th.png`
- `qa-output/shots/transactions__admin__desktop__en.png`
- `qa-output/shots/transactions__admin__desktop__th.png`
- `qa-output/shots/transactions__admin__laptop__en.png`
- `qa-output/shots/transactions__admin__laptop__th.png`
- `qa-output/shots/transactions__admin__phone__en.png`
- `qa-output/shots/transactions__admin__phone__th.png`
- `qa-output/shots/transactions__contributor__desktop1280__en.png`
- `qa-output/shots/transactions__contributor__desktop1280__th.png`
- `qa-output/shots/transactions__contributor__desktop__en.png`
- `qa-output/shots/transactions__contributor__desktop__th.png`
- `qa-output/shots/transactions__contributor__laptop__en.png`
- `qa-output/shots/transactions__contributor__laptop__th.png`
- `qa-output/shots/transactions__contributor__phone__en.png`
- `qa-output/shots/transactions__contributor__phone__th.png`
