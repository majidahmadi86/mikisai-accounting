# QA report · MikiSai Accounting v2.5 to v2.9

Generated 2026-09-18T10:19:33.549Z from 618 recorded checks across 32 routes. **All checks pass; zero known defects.**

Each cell is the number of checks that passed for that route as that role, at that viewport (phone = 375px, desktop = 1440px), in that language. A check is one assertion group: page loads with the right heading, page invariants (no sideways scroll, no raw dictionary key, no unfilled placeholder, no em dash, a heading), no console errors, plus the form, export and role checks the flow specs record.

## Route × role × viewport × language

| Route | admin · phone · en | admin · phone · th | admin · desktop · en | admin · desktop · th | contributor · phone · en | contributor · phone · th | contributor · desktop · en | contributor · desktop · th |
|---|---|---|---|---|---|---|---|---|
| `/` | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/ (quick entry)` | · | · | pass 2 | · | pass 1 | · | · | · |
| `/ (transfer sheet)` | · | · | pass 2 | · | · | · | · | · |
| `/ (transfer)` | · | · | pass 2 | · | · | · | · | · |
| `/audit` | pass 3 | pass 3 | pass 4 | pass 3 | pass 2 | pass 1 | pass 1 | pass 1 |
| `/balance` | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/customers` | pass 3 | pass 3 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/import` | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/insights` | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/investment` | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/login` | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 | pass 4 |
| `/more` | pass 3 | pass 3 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/more/check-books` | pass 3 | pass 3 | pass 4 | pass 3 | pass 2 | pass 1 | pass 1 | pass 1 |
| `/more/deleted` | pass 3 | pass 3 | pass 3 | pass 3 | pass 2 | pass 1 | pass 1 | pass 1 |
| `/more/health` | pass 3 | pass 3 | pass 4 | pass 3 | pass 4 | pass 3 | pass 3 | pass 3 |
| `/payouts` | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/payouts/[id]/edit` | · | · | pass 2 | · | · | · | · | · |
| `/payouts/[id]/reconcile` | pass 1 | pass 1 | pass 2 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 |
| `/payouts/new` | pass 3 | pass 3 | pass 5 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/products` | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/products/[id]` | pass 3 | pass 3 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/products/[id]/edit` | · | · | pass 1 | · | pass 1 | · | · | · |
| `/products/new` | · | · | pass 2 | · | pass 1 | · | · | · |
| `/reports` | pass 3 | pass 3 | pass 33 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/reports/units` | pass 3 | pass 3 | pass 5 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/settings` | pass 3 | pass 3 | pass 4 | pass 3 | pass 4 | pass 3 | pass 3 | pass 3 |
| `/stock` | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/transactions` | pass 3 | pass 3 | pass 4 | pass 3 | pass 3 | pass 3 | pass 3 | pass 3 |
| `/transactions/[id]/edit` | pass 3 | pass 3 | pass 8 | pass 3 | pass 4 | pass 3 | pass 3 | pass 3 |
| `/transactions/new` | pass 3 | pass 3 | pass 5 | pass 3 | pass 4 | pass 3 | pass 3 | pass 3 |
| `/transactions/new?type=expense` | · | · | pass 2 | · | · | · | · | · |
| `/transfers/[id]/edit` | · | · | pass 1 | · | · | · | · | · |

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

## What is covered by Playwright

- `e2e/qa/matrix.spec.ts`: every route as admin and contributor, EN and TH, 375px and 1440px, with a screenshot each (`qa-output/shots/`).
- `e2e/qa/flows-admin.spec.ts`: income form valid and invalid (lines that do not add up are refused with the difference), ledger and Reports move by the net amount, edit keeps gross and recomputes the unit price, soft delete and restore; quick entry with product chip and qty stepper; stock purchase with lines and backlog change; payout create, reconcile, confirm, edit and invalid; transfers valid and invalid; product create, edit, delete, restore; settings save; customers; units toggles; data health run; check books; audit export; sign out.
- `e2e/qa/flows-contributor.spec.ts`: add and edit own sale, no Delete button, add a product but not edit one, read-only settings, denied on admin pages, read-only data health, quick entry.
- `e2e/qa/exports.spec.ts`: every report's XLSX body compared cell for cell with the on-screen table, every PDF parsed and checked for its title and headline figure, units and download-everything exports.
- `e2e/qa/admin-edits-all.spec.ts`: the contributor creates an income, an expense, a payout and a transfer; the admin opens, edits and soft-deletes each, and the ledger row reads created by Sai · edited by Mike.
- `e2e/snapshots-375.spec.ts`: 375px visual baselines of Reports and Stock, plus a check that no stat value overflows its tile.

## Not automated

- `/import` AI parsing (Gemini) is not called from tests; the page, its validation (empty input refused) and the review table are covered, the model call is exercised by hand.

## Screenshots after fixing

- `qa-output/shots/audit__admin__desktop__en.png`
- `qa-output/shots/audit__admin__desktop__th.png`
- `qa-output/shots/audit__admin__phone__en.png`
- `qa-output/shots/audit__admin__phone__th.png`
- `qa-output/shots/audit__contributor__desktop__en.png`
- `qa-output/shots/audit__contributor__desktop__th.png`
- `qa-output/shots/audit__contributor__phone__en.png`
- `qa-output/shots/audit__contributor__phone__th.png`
- `qa-output/shots/balance__admin__desktop__en.png`
- `qa-output/shots/balance__admin__desktop__th.png`
- `qa-output/shots/balance__admin__phone__en.png`
- `qa-output/shots/balance__admin__phone__th.png`
- `qa-output/shots/balance__contributor__desktop__en.png`
- `qa-output/shots/balance__contributor__desktop__th.png`
- `qa-output/shots/balance__contributor__phone__en.png`
- `qa-output/shots/balance__contributor__phone__th.png`
- `qa-output/shots/customers__admin__desktop__en.png`
- `qa-output/shots/customers__admin__desktop__th.png`
- `qa-output/shots/customers__admin__phone__en.png`
- `qa-output/shots/customers__admin__phone__th.png`
- `qa-output/shots/customers__contributor__desktop__en.png`
- `qa-output/shots/customers__contributor__desktop__th.png`
- `qa-output/shots/customers__contributor__phone__en.png`
- `qa-output/shots/customers__contributor__phone__th.png`
- `qa-output/shots/home__admin__desktop__en.png`
- `qa-output/shots/home__admin__desktop__th.png`
- `qa-output/shots/home__admin__phone__en.png`
- `qa-output/shots/home__admin__phone__th.png`
- `qa-output/shots/home__contributor__desktop__en.png`
- `qa-output/shots/home__contributor__desktop__th.png`
- `qa-output/shots/home__contributor__phone__en.png`
- `qa-output/shots/home__contributor__phone__th.png`
- `qa-output/shots/import__admin__desktop__en.png`
- `qa-output/shots/import__admin__desktop__th.png`
- `qa-output/shots/import__admin__phone__en.png`
- `qa-output/shots/import__admin__phone__th.png`
- `qa-output/shots/import__contributor__desktop__en.png`
- `qa-output/shots/import__contributor__desktop__th.png`
- `qa-output/shots/import__contributor__phone__en.png`
- `qa-output/shots/import__contributor__phone__th.png`
- `qa-output/shots/insights__admin__desktop__en.png`
- `qa-output/shots/insights__admin__desktop__th.png`
- `qa-output/shots/insights__admin__phone__en.png`
- `qa-output/shots/insights__admin__phone__th.png`
- `qa-output/shots/insights__contributor__desktop__en.png`
- `qa-output/shots/insights__contributor__desktop__th.png`
- `qa-output/shots/insights__contributor__phone__en.png`
- `qa-output/shots/insights__contributor__phone__th.png`
- `qa-output/shots/investment__admin__desktop__en.png`
- `qa-output/shots/investment__admin__desktop__th.png`
- `qa-output/shots/investment__admin__phone__en.png`
- `qa-output/shots/investment__admin__phone__th.png`
- `qa-output/shots/investment__contributor__desktop__en.png`
- `qa-output/shots/investment__contributor__desktop__th.png`
- `qa-output/shots/investment__contributor__phone__en.png`
- `qa-output/shots/investment__contributor__phone__th.png`
- `qa-output/shots/login__admin__desktop__en.png`
- `qa-output/shots/login__admin__desktop__th.png`
- `qa-output/shots/login__admin__phone__en.png`
- `qa-output/shots/login__admin__phone__th.png`
- `qa-output/shots/login__contributor__desktop__en.png`
- `qa-output/shots/login__contributor__desktop__th.png`
- `qa-output/shots/login__contributor__phone__en.png`
- `qa-output/shots/login__contributor__phone__th.png`
- `qa-output/shots/more-check-books__admin__desktop__en.png`
- `qa-output/shots/more-check-books__admin__desktop__th.png`
- `qa-output/shots/more-check-books__admin__phone__en.png`
- `qa-output/shots/more-check-books__admin__phone__th.png`
- `qa-output/shots/more-check-books__contributor__desktop__en.png`
- `qa-output/shots/more-check-books__contributor__desktop__th.png`
- `qa-output/shots/more-check-books__contributor__phone__en.png`
- `qa-output/shots/more-check-books__contributor__phone__th.png`
- `qa-output/shots/more-deleted__admin__desktop__en.png`
- `qa-output/shots/more-deleted__admin__desktop__th.png`
- `qa-output/shots/more-deleted__admin__phone__en.png`
- `qa-output/shots/more-deleted__admin__phone__th.png`
- `qa-output/shots/more-deleted__contributor__desktop__en.png`
- `qa-output/shots/more-deleted__contributor__desktop__th.png`
- `qa-output/shots/more-deleted__contributor__phone__en.png`
- `qa-output/shots/more-deleted__contributor__phone__th.png`
- `qa-output/shots/more-health__admin__desktop__en.png`
- `qa-output/shots/more-health__admin__desktop__th.png`
- `qa-output/shots/more-health__admin__phone__en.png`
- `qa-output/shots/more-health__admin__phone__th.png`
- `qa-output/shots/more-health__contributor__desktop__en.png`
- `qa-output/shots/more-health__contributor__desktop__th.png`
- `qa-output/shots/more-health__contributor__phone__en.png`
- `qa-output/shots/more-health__contributor__phone__th.png`
- `qa-output/shots/more__admin__desktop__en.png`
- `qa-output/shots/more__admin__desktop__th.png`
- `qa-output/shots/more__admin__phone__en.png`
- `qa-output/shots/more__admin__phone__th.png`
- `qa-output/shots/more__contributor__desktop__en.png`
- `qa-output/shots/more__contributor__desktop__th.png`
- `qa-output/shots/more__contributor__phone__en.png`
- `qa-output/shots/more__contributor__phone__th.png`
- `qa-output/shots/payouts-id-reconcile__admin__desktop__en.png`
- `qa-output/shots/payouts-new__admin__desktop__en.png`
- `qa-output/shots/payouts-new__admin__desktop__th.png`
- `qa-output/shots/payouts-new__admin__phone__en.png`
- `qa-output/shots/payouts-new__admin__phone__th.png`
- `qa-output/shots/payouts-new__contributor__desktop__en.png`
- `qa-output/shots/payouts-new__contributor__desktop__th.png`
- `qa-output/shots/payouts-new__contributor__phone__en.png`
- `qa-output/shots/payouts-new__contributor__phone__th.png`
- `qa-output/shots/payouts__admin__desktop__en.png`
- `qa-output/shots/payouts__admin__desktop__th.png`
- `qa-output/shots/payouts__admin__phone__en.png`
- `qa-output/shots/payouts__admin__phone__th.png`
- `qa-output/shots/payouts__contributor__desktop__en.png`
- `qa-output/shots/payouts__contributor__desktop__th.png`
- `qa-output/shots/payouts__contributor__phone__en.png`
- `qa-output/shots/payouts__contributor__phone__th.png`
- `qa-output/shots/products-id-__admin__desktop__en.png`
- `qa-output/shots/products-id-__admin__desktop__th.png`
- `qa-output/shots/products-id-__admin__phone__en.png`
- `qa-output/shots/products-id-__admin__phone__th.png`
- `qa-output/shots/products-id-__contributor__desktop__en.png`
- `qa-output/shots/products-id-__contributor__desktop__th.png`
- `qa-output/shots/products-id-__contributor__phone__en.png`
- `qa-output/shots/products-id-__contributor__phone__th.png`
- `qa-output/shots/products__admin__desktop__en.png`
- `qa-output/shots/products__admin__desktop__th.png`
- `qa-output/shots/products__admin__phone__en.png`
- `qa-output/shots/products__admin__phone__th.png`
- `qa-output/shots/products__contributor__desktop__en.png`
- `qa-output/shots/products__contributor__desktop__th.png`
- `qa-output/shots/products__contributor__phone__en.png`
- `qa-output/shots/products__contributor__phone__th.png`
- `qa-output/shots/reports-units__admin__desktop__en.png`
- `qa-output/shots/reports-units__admin__desktop__th.png`
- `qa-output/shots/reports-units__admin__phone__en.png`
- `qa-output/shots/reports-units__admin__phone__th.png`
- `qa-output/shots/reports-units__contributor__desktop__en.png`
- `qa-output/shots/reports-units__contributor__desktop__th.png`
- `qa-output/shots/reports-units__contributor__phone__en.png`
- `qa-output/shots/reports-units__contributor__phone__th.png`
- `qa-output/shots/reports__admin__desktop__en.png`
- `qa-output/shots/reports__admin__desktop__th.png`
- `qa-output/shots/reports__admin__phone__en.png`
- `qa-output/shots/reports__admin__phone__th.png`
- `qa-output/shots/reports__contributor__desktop__en.png`
- `qa-output/shots/reports__contributor__desktop__th.png`
- `qa-output/shots/reports__contributor__phone__en.png`
- `qa-output/shots/reports__contributor__phone__th.png`
- `qa-output/shots/settings__admin__desktop__en.png`
- `qa-output/shots/settings__admin__desktop__th.png`
- `qa-output/shots/settings__admin__phone__en.png`
- `qa-output/shots/settings__admin__phone__th.png`
- `qa-output/shots/settings__contributor__desktop__en.png`
- `qa-output/shots/settings__contributor__desktop__th.png`
- `qa-output/shots/settings__contributor__phone__en.png`
- `qa-output/shots/settings__contributor__phone__th.png`
- `qa-output/shots/stock__admin__desktop__en.png`
- `qa-output/shots/stock__admin__desktop__th.png`
- `qa-output/shots/stock__admin__phone__en.png`
- `qa-output/shots/stock__admin__phone__th.png`
- `qa-output/shots/stock__contributor__desktop__en.png`
- `qa-output/shots/stock__contributor__desktop__th.png`
- `qa-output/shots/stock__contributor__phone__en.png`
- `qa-output/shots/stock__contributor__phone__th.png`
- `qa-output/shots/transactions-after-save__admin__desktop__en.png`
- `qa-output/shots/transactions-after-save__contributor__phone__en.png`
- `qa-output/shots/transactions-id-edit-after__admin__desktop__en.png`
- `qa-output/shots/transactions-id-edit__admin__desktop__en.png`
- `qa-output/shots/transactions-id-edit__admin__desktop__th.png`
- `qa-output/shots/transactions-id-edit__admin__phone__en.png`
- `qa-output/shots/transactions-id-edit__admin__phone__th.png`
- `qa-output/shots/transactions-id-edit__contributor__desktop__en.png`
- `qa-output/shots/transactions-id-edit__contributor__desktop__th.png`
- `qa-output/shots/transactions-id-edit__contributor__phone__en.png`
- `qa-output/shots/transactions-id-edit__contributor__phone__th.png`
- `qa-output/shots/transactions-new-invalid__admin__desktop__en.png`
- `qa-output/shots/transactions-new__admin__desktop__en.png`
- `qa-output/shots/transactions-new__admin__desktop__th.png`
- `qa-output/shots/transactions-new__admin__phone__en.png`
- `qa-output/shots/transactions-new__admin__phone__th.png`
- `qa-output/shots/transactions-new__contributor__desktop__en.png`
- `qa-output/shots/transactions-new__contributor__desktop__th.png`
- `qa-output/shots/transactions-new__contributor__phone__en.png`
- `qa-output/shots/transactions-new__contributor__phone__th.png`
- `qa-output/shots/transactions__admin__desktop__en.png`
- `qa-output/shots/transactions__admin__desktop__th.png`
- `qa-output/shots/transactions__admin__phone__en.png`
- `qa-output/shots/transactions__admin__phone__th.png`
- `qa-output/shots/transactions__contributor__desktop__en.png`
- `qa-output/shots/transactions__contributor__desktop__th.png`
- `qa-output/shots/transactions__contributor__phone__en.png`
- `qa-output/shots/transactions__contributor__phone__th.png`
