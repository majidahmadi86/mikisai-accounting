# MikiSai Accounting

Accounting for the two MikiSai founders, built for phones first. Next.js App Router, Supabase (Postgres, Auth, Storage), Vercel in Singapore. All amounts in Thai baht. English by default with a TH toggle.

## What is where

Phones get a bottom tab bar: Home · Ledger · Add · My Balance · More. Desktop gets the same routes in the header.

| Route | What it does |
| --- | --- |
| `/` | Who owes whom, money in the bank, expenses, profit, what each platform still owes, recent entries, transfers between the founders |
| Add (the plus button) | Quick-entry sheet from any screen: Income or Expense, amount with the numeric keypad, one-tap platform, product, person and category chips, live "you receive" estimate, customer autocomplete, save with a six second undo, "Save and add another", "Import from screenshot" |
| `/transactions` | Filterable ledger. Tap an entry to edit it; the admin also sees who added it and who last edited it |
| `/balance` | My Balance: the signed-in founder's own side. Owed to me now, half of what is still with the platforms with expected arrival dates, my money in the partner's hands against the exposure limit, today's action with "Mark as sent", capital I have put in, and a 30-day chart |
| `/reports` | This week, this month or a custom period. Profit and loss, sales by product, sales by platform, expenses by category, payout status, who-owes-whom history, customer list. Every report downloads as Excel or PDF |
| `/insights` | Computed from the ledger: product ranking with "push this" or "review pricing" tags, best platform per product, velocity (7 vs 30 days), margin drift alerts, cash forecast per platform, reconciliation exceptions. Optional weekly paragraph from Gemini |
| `/more` | Reports, Import, Payouts, Customers, Insights, Settings, Help, language, sign out; the admin also gets Audit and Recently deleted |
| `/import` | Paste text or upload screenshots and PDFs of a TikTok, Shopee or Facebook report. Gemini extracts orders into a review table. Nothing is saved until you confirm |
| `/payouts` | Record a bank payout, then match it to orders: FIFO proposal within ±2%, adjust with checkboxes, confirm |
| `/customers` | Built from customer names on sales, with totals and an editable note |
| `/audit` | Every change: who, what, when, before and after. Filter by person, action, record and date. Download as Excel |
| `/settings` | Per platform: commission %, fixed fee, days until payout and early-payout %. Exposure limit for My Balance. Expense categories (add, rename in EN and TH, reorder, hide). Products and stock (usual cost and price, low stock threshold, admin stock corrections). Admin edits; contributors read and may add products |
| `/more/help` | Plain-words answers and the five-step tour |
| `/login` | Email and password. No public signup |

## Accounting model (v2.4)

One profit, accrual basis, in `src/lib/accounting/statements.ts`:

```
Profit = Revenue (you received) - Cost of units sold (moving average) - Operating expenses
```

- Stock purchases are not expenses; they become inventory. Each expense row contributes cash paid minus the value of units it brought into stock plus the cost of units it took out. A stock purchase with product lines contributes zero, a Samples row with a cost per unit (bought and given away) contributes its cash once, a Samples row taken from existing stock contributes the average cost of the unit. Nothing is counted twice.
- Cash flow: order money that reached a bank account in the period (payouts and direct bank transfers, by settled date) against every payment made, stock included.
- Balance sheet at the period end: cash held by each partner, money still with the platforms, stock on hand at cost; minus the purchase backlog liability (units sold before they were bought, at the cost already charged). Assets minus liabilities equals the partners' equity, which equals profit to date. `checkBooks` asserts this; More → Check books runs it on live data and the reconciliation suite (`tests/reconciliation.test.ts`) runs it on the seed fixture and on a fixture matching the real 15 September data (9 orders, 5 x 1 and 4 x 2 boxes; 16 September purchase of 12; 14 September samples ฿890).
- My Balance and Who owes whom keep their cash definition and show the reconciliation line: profit this period, of which how much is in stock, pending at platforms, and cash.
- Buy to order: `products.stock_mode` is `buy_to_order` or `stocked`. Negative stock on a buy-to-order product is a purchase backlog (FIFO, `src/lib/inventory/backlog.ts`) shown in berry, never as a red negative; "Units to buy today" appears on Home, Products and the Units report. Stocked products below zero are a Data health issue.
- Units report (`/reports/units`): per product per day, week or month, with weekly and monthly subtotals, exports to XLSX and PDF. Ledger rows show product and quantity, never the product line alone.
- Quantities: a sale cannot be saved without a product and a whole-unit quantity. Import reads "x2", "จำนวน 2" and kg or box variants deterministically (`src/lib/inventory/quantity.ts`): "20 kg" or "2 กล่อง" is the 10 kg box times two. A missing quantity is red in review and blocks confirm. When you receive per unit is outside 0.6x to 1.6x the standard price the app warns "Amount looks like N units, not M" without blocking.
- Data health (More → Data health): automated checks with counts, rows and one-tap open; runs on page load and daily via the Vercel cron in `vercel.json` hitting `/api/health/daily` with `CRON_SECRET`. Home shows the last run.

## One way to do each thing (v3.0)

The test for every screen: Sai can use it without asking Mike what anything means. The inventory that led here, with every removal and its reason, is in `docs/AUDIT-v3.0.md`.

- One entry door. Add (`src/components/quick-entry/AddSheet.tsx`) has four large choices: Sale, Expense, Money moved, Payout received. Sale (`SaleSheet`) is order ID, quantity, you receive (prefilled) and where the money is, with More for customer, another product, date, platform and note. Expense (`ExpenseSheet`) leads with Stock purchase and Samples. Money moved is the one transfer form; My Balance and Investment open it already filled in. Payout received saves and opens the matching page. There is no Income tab, no Order tab, no `/transactions/new`, no `/payouts/new`, and no second Add button on any page. The full form remains for editing.
- Home holds three things: the balance banner with the two partner cards, one routine card (admin: "Tonight: export, drop, confirm" with the last run and counts; contributor: "Record what you paid for today", one button that opens Expense on Stock purchase) with the Last import line inside, and the Stock strip. A sale typed by hand is not an import. Yesterday lives on Reports, Units; every Money moved entry is listed on My Balance.
- Import is a page, not part of Add: the admin gets the nightly TikTok files first and screenshots below; a contributor gets the share-to-app card and screenshots only.
- Words: no settlement, allocation, clawback, reconciliation or SKU in the interface; paid out, paid, taken back, matched, product instead. Status pills name the platform (`statusName` in `src/lib/labels.ts`): "Waiting for TikTok", "Paid by TikTok, still in wallet", "In the bank", "Cancelled", "Refunded". Code and database names are unchanged.
- Help lives behind info icons: `Field` puts a hint behind the icon beside the label, `CardHeader` does the same with a card's explanation, and pages keep their title plus one plain sentence.

## Navigation and tables that never scroll sideways (v3.0)

- Header: no search input in the nav. A magnifier button (and Ctrl/Cmd+K) opens a full-width overlay (`src/components/nav/SearchOverlay.tsx`, `src/app/(app)/search/actions.ts`, `src/lib/search.ts`): order ID, customer, amount, note and product, results in groups, arrows to move, Enter to open, Esc to close. On a phone it is the top-right icon. `/search` stays as the "see every result" page.
- The nav never scrolls: from 1024px all eight items sit on one line (the wordmark steps aside below 1280px); between 768 and 1024 Insights and More fold into a More menu together with the language toggle and sign out; below 768 the bottom tab bar is the nav.
- The table layout rule lives in `src/components/ui/Table.tsx`. Every column declares a content class (`date`, `datetime`, `id`, `money`, `num`, `short`, `long`, `pill`, `status`, `action`) that fixes its width under `table-layout: fixed`, so headers line up with cells, and a priority: primary (always), secondary (from 1280px), tertiary (only in the row detail). What is hidden shows in the expandable row detail (`ExpandableRow`, `RowDetail`). Text cells clamp to two lines with a tooltip, numbers are right-aligned tabular figures, dates never wrap, actions are 44px icons with tooltips. Below 1024px tables give way to the stacked cards (the directive asks for cards below 768px; between 768 and 1024 the primary columns alone were too cramped to read, so cards cover that range too).
- Product cells read "1 kg packs · 10 kg box" (`productLine` in `src/lib/search.ts`: short name plus the variant without its bracketed pack detail); the full name is in the row detail and on hover. The Ledger shows "1 kg packs × 2" on one line and the buyer's name only; the note, the byline and Mark cancelled are in the row detail.
- Reports: each export column may carry a `priority` (`src/lib/exports/tables.ts`); XLSX and PDF ignore it. Import review is one editable card per order at every width, because thirteen editable columns cannot fit without scrolling.
- Data guards: Sale and the income edit form require an order ID (`src/lib/ledger/order-ref.ts`, `OrderRefField`). "No order ID" is an explicit toggle that asks for a reason; the reason is kept at the end of the note and the server checks again. Data health lists those sales as "Will not match imports" and explains a purchase backlog in one sentence ("Sold N, bought M. Either a purchase is missing or N orders are not shipped yet"), linking to Recently deleted and to the orders.
- Tests: `e2e/qa/widths.spec.ts` opens every route at 375, 390, 768, 1024, 1280 and 1440px in EN and TH and asserts `document.documentElement.scrollWidth === window.innerWidth`, no element wider than the viewport, and header `scrollWidth === clientWidth`; the QA matrix adds 1024 and 1280; `e2e/v30.spec.ts` covers the header, the More menu, the overlay and the Products and Ledger tables; `tests/search.test.ts` and `tests/order-ref.test.ts` cover the pure logic.

## Nightly TikTok files (v2.9-CSV)

Until TikTok approves the Open API app, the admin's nightly routine is the way in: export, drop, confirm.

- `/import` opens with the Nightly TikTok panel: two drop zones (Orders export, Finance export; CSV or XLSX; several files at once; either box takes either file) with links to the two Seller Center pages. Home shows the admin a "Yesterday's routine" card with the last run and its counts, in a warning tone after 36 hours.
- File type is read from the headers; columns are found by meaning in Thai or English (`src/lib/import/tiktok.ts`, now including SKU id, payout id, payout date and payout amount), Buddhist years are handled, the mapping is saved per file type and the admin adjusts it once. Originals are kept in `report_uploads`.
- `/api/import-nightly` turns file rows into the API sync's own shapes (`src/lib/tiktok/from-file.ts`) and runs them through the same `planSync`, the same dedupe by order number and the same `tiktok_sku_map` (migration 0025): a row from a file and a row from the API are the same thing downstream. The auto-confirm rule is identical; ambiguous rows land in the one review; status changes go through `mark_order_status`. One screen, one confirm, through `commitRows`.
- Finance file: payouts are deduped by TikTok payment id and pay exactly the orders the file names (`matchPayoutExact`), so a real order is never settled by guesswork. `payout_allocations` records which payout paid how much of which order, so one order can be covered by two payouts (70% early, 30% later): pending with the part paid after the first, in the bank after the second. A payout the file does not fully explain waits on Payouts for one tap. The API sync passes the same per-order amounts from its statements.
- `tiktok_sku_map`: a SKU matched by name is remembered; one the app cannot place waits for the admin to pick its product once, on the review screen.
- Data health: "No TikTok import in 36 h", "SKUs awaiting mapping", "Orders in file missing a status", "Payout not fully matched".
- `/more/connect-tiktok` is honest about the API: the admin sets "Approval pending · individual sellers may not qualify · ticket sent <date>" (`tiktok_app_status`), and Authorize stays disabled with a hint until approval is marked received.
- Sai's phone path (share-to-app screenshots, same review, same dedupe) is unchanged.
- Tests: `tests/fixtures/seller-center` holds exports with Thai headers, Buddhist years, a cancelled order and an order paid 70% then 30%. `tests/nightly-import.test.ts` asserts the mapping, that a second drop changes nothing, that the cancellation applies, that both payouts name the same order, and that a CSV row seen again by the API sync is not duplicated (and is field for field identical). `tests/integration/payout-7030.test.ts` runs the two payouts against the live database; `e2e/v29-csv.spec.ts` drops the files at 1440px.

## TikTok Shop Open API sync (v2.9)

The app reads Sai's shop directly, so TikTok needs no manual entry. `/more/connect-tiktok` walks through the one-time setup in EN and TH, shows the connection and lists every sync.

- Setup: register as a Seller Developer in TikTok Shop Partner Center, create an app (order management or finance; scopes Order, Return and Refund, Finance) with redirect URL `https://mikisai.mikaro.studio/api/tiktok/callback` and, optionally, webhook URL `https://mikisai.mikaro.studio/api/tiktok/webhook`. Set `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_SERVICE_ID` (if any) and `TIKTOK_TOKEN_KEY` (32 random bytes, base64) in Vercel. The admin presses Authorize, Sai approves with the shop account, and the callback stores the tokens. Until TikTok's app review passes only a test shop returns data; the page says so.
- Secrets: the tokens are encrypted with AES-256-GCM (`src/lib/tiktok/crypto.ts`) and kept in `tiktok_connections`, a table with row level security on and no policies, so only the service role reads it. They are not on the `businesses` row because both founders can read that row. The OAuth state is HMAC-signed and valid for fifteen minutes.
- Sync (`src/lib/tiktok/sync.ts`): `/api/tiktok/sync` runs every 30 minutes from the Vercel cron (Bearer `CRON_SECRET`), on a webhook hint, and from Sync now. It asks for orders, returns, finance statements and payments updated since the last cursor with an hour of overlap, so the poll is the source of truth and a webhook is only a nudge (`/api/tiktok/webhook` checks the signature, then runs the same poll). `planSync` decides without touching the database: an order with an order number, a quantity, one matched product and the amount TikTok settles goes straight into the ledger; anything less waits in `sync_queue` and shows on Import in the same review table, and a later sync finishes it by itself when the settlement arrives. Cancellations and completed refunds are applied to orders already in the ledger through `mark_order_status`, so truth.ts treats them like any other. Paid payments become payouts (deduped by TikTok's payment id) and are matched oldest first when the amount fits; otherwise they wait on Payouts for one tap. Everything is written through `commitRows`, the same core the Import page uses.
- Resilience: access tokens are refreshed fifteen minutes ahead; a failed refresh marks the connection expired. Every run writes a `sync_log` row. Home shows "TikTok connected · last sync 12 min ago · 3 new orders"; Data health "TikTok connection needs attention" lists a dead token, a failed sync, six hours without a sync, or an authorization about to run out.
- Manual entry, quick order, screenshots and the Seller Center export stay available. All of them, and the sync, dedupe by order number per platform.
- Tests use recorded-style fixtures in `tests/fixtures/tiktok` (202309 response shapes): signing against a frozen vector, pagination, token exchange and refresh, retry and token errors, webhook signatures, encryption, mapping and the sync plan. `scripts/tiktok-mock-server.ts` serves the same fixtures over HTTP and `scripts/tiktok-sync-local.ts` runs the whole pipeline against it and the linked database with probe rows, then cleans up. Field names follow the 202309 documentation and have not been checked against live responses; the fixtures are the contract to adjust once the approved app returns real data.

## Integrity on delete and edit, order identity, cancellations, zero-effort entry (v2.8)

- Cascade integrity (migration 0020): soft-deleting a transaction soft-deletes its lines, stock movements, settlement and clawbacks in the same database transaction (a security-definer trigger), and restoring brings back exactly the ones that went with it. Editing a purchase or sale re-derives its movements inside the items RPC. A sale deleted after it was matched leaves its payout flagged "1 order removed, X unallocated · Needs re-confirm" until someone re-confirms. Children orphaned before the rule were soft-deleted by the migration with a system_correction audit note (the 17 Sept 5,200 purchase). Data health check "Stock moves without a live payment" must read 0.
- Order identity (migration 0021): `transactions.order_ref`, indexed per platform; existing "#number" notes were split. The Ledger has an Order ID column with one-tap copy, the header has a global search (order id, customer, amount, note) at `/search`, Product detail and Customers link to their orders. Saving an order number that already exists on the platform shows "Already recorded on date, amount" and blocks; the admin can save anyway with a reason that lands in the note.
- Cancellations and refunds (migration 0022): `transactions.status` active | cancelled | refunded with `status_date`, `status_reason` and `refund_amount` (what the platform takes back, in you-receive terms). `mark_order_status` writes the status, the return movement at the cost the units were charged (a partial refund returns the matching share of units) and, when money had already been paid out, a pending clawback (the negative settlement) in one database transaction. `truth.normalizeLedger` is the one place the rule lives: cancelled sales leave revenue, orders and units; refunded sales stay at what is left; cash that had arrived still counts and its clawback takes it out again, so who owes whom never double counts. "Clawback pending X" shows on Payouts and My Balance; the next reconciliation on that platform offsets it (the orders it covers add up to the amount plus the clawbacks). P&L and Sales carry a "Cancelled / refunded" line, Units a Returns column; Data health "Cancelled orders still counted" must read 0. "Mark cancelled" is one tap on a ledger or search row; the admin can reinstate unless the clawback was already offset.
- Entry paths, in priority order (migration 0023):
  - Seller Center CSV or XLSX export (Mike, desktop, nightly): `/api/import-table` reads the Orders export and the Finance statement, finds columns by meaning in English or Thai (`src/lib/import/tiktok.ts`), handles Buddhist-year dates, keeps the file in `report_uploads`, and answers with the same review as every other path. The admin can adjust the mapping once and save it (`import_mappings`). One review: new orders, status changes applied to orders already in the ledger, payouts with their FIFO match, duplicates skipped by order number, every assumption a gold tag. One confirm.
  - Share-to-app screenshots (Sai, phone): the app is an installable PWA with a Web Share Target; screenshots shared from the TikTok Seller app land on `/import?shared=1` with the files attached (the service worker in `public/sw.js` parks them in Cache Storage). Order pages, order lists, wallet screens and cancellation screens are read; wallet screens create payouts and match them. A missing date becomes the upload date tagged "date assumed", a missing quantity is inferred from you-receive divided by the expected net per unit and tagged "qty inferred"; both are listed under Data health until confirmed with one tap. iPhone does not support share-to-app for installed web apps, so the install card gives Safari's Add to Home Screen steps and the Import page's picker instead.
  - Quick order (manual fallback): the bottom sheet's Order mode takes the order ID, a quantity stepper and what you receive (prefilled from the expected net per unit), plus the status. One tap.
  - Home says what last fed the ledger: "Last import: Seller Center file, 18 Sept 21:10 · 14 orders, 2 cancellations, 1 payout" (`import_runs`).

## One truth per number, plain words, transfer sheet (v2.7)

- `src/lib/truth.ts` is the only place these numbers are computed: `whoOwesWhom` (cash basis: income in bank, minus expenses paid, plus or minus every transfer whatever its reason), `contributions` (display only: expenses paid plus transfers sent for anything but a profit share), `stockPositions`, `inventoryValue`, `profitAndLoss`, `cashFlow`, `samplesGiven`. Home, My Balance, Investment "To be equal", the Who owes whom report and the Balance sheet all call `whoOwesWhom`; Stock, the Home strip, Units, Product detail and the Balance sheet inventory all call `stockPositions`. `tests/truth.test.ts` asserts the equalities on the seed and live-shaped fixtures, and Data health runs them on live data under "Pages that disagree".
- Transfer reasons in plain words: money for stock, money for samples, my half of a cost the other paid, paying the other's profit share, other (say what). Every reason changes who owes whom; the reason only explains why. Existing rows were renamed in place (migration 0018); the 16 Sept ฿2,005 transfer was corrected from profit share to my half of a cost through the normal update path (`scripts/correct-transfer.ts`, audit entry with before and after).
- Home partner cards read received from platforms, received from partner, put in, with "Fair share of costs so far" beneath. "Settlement" and "reimbursement" no longer appear in the UI.
- "Record an internal transfer" is a berry button on Home that opens the bottom sheet in transfer mode (`src/components/quick-entry/TransferSheet.tsx`): reason chips in one column below 640px and two above, wrapping at word boundaries only.
- Sample products can be named where they are seen: an inline rename on Stock cards and the Products list (admin); Data health lists products that still show a bare size.

## Stock, Investment, honest expectations, plain language (v2.6)

- `/stock` (main nav): one card per active product with Bought · Sold · Samples · On hand (or Purchase backlog in berry), stock value at average cost, average cost, last purchase and units to buy today; a movement history newest first (date, kind, qty, cost or sale price per unit, who recorded it, link to the row) filtered by product and date; admin count corrections with a required reason; XLSX and PDF export of the history. Home carries a compact stock strip.
- `/investment` (More, and a card on My Balance): a contribution is money a partner paid out for the business, an expense paid directly or a capital transfer sent (a capital transfer received is taken off the receiver's figure, so the total equals what the business spent). Total invested, each partner's figure, fair share, "to be equal X owes Y" with a one-tap transfer (reason expense reimbursement), returns so far (cash from platforms, profit to date, pending), and every contribution with running totals (`src/lib/investment.ts`).
- Plain language: nobody "holds -฿X". The banner, Who owes whom and the Balance sheet say what each partner received and put in.
- `products.expected_net_per_unit`: what a unit really brings in after fees and discounts (default: standard price minus the platform fee). Planned vs actual margin uses it, shows the realized net per unit next to it, and Data health warns when a product with five or more sales has no figure.
- Samples agree: the Samples card is built from the Samples expense rows at what each row cost the business, the same number the profit and loss charges, so the two can never differ. Bought-and-given samples are valued at their purchase cost on named sample products (migration 0017 moved the three "Other · Unspecified" units to Sample sugar A, B and C at ฿296.67, ฿296.67 and ฿296.66).
- Admin edits everything: rows carry `updated_by`, ledger rows read "created by Sai · edited by Mike", and `e2e/qa/admin-edits-all.spec.ts` proves the admin can edit and delete rows a contributor created.
- Payout discipline: Home reminds both founders after 18:00 Bangkok when money is pending and no payout is dated today; a payout smaller than the selected orders covers them oldest first and the remainder stays pending on the last one (`settlements.paid_amount`), so TikTok's 70/30 early payout records naturally.
- Reconciliation on the live-shaped fixture (`src/lib/fixtures/live-shaped.ts`): bought 32, sold 20, samples 3 gives on hand 12 worth ฿3,120, COGS ฿5,200, samples ฿890 in both cards, invested ฿9,210 (Mike ฿2,005, Sai ฿7,205), Mike owes ฿2,600.

## Line items, product picker, Units layout, QA (v2.5)

- Line items reconcile to the row: qty x sale price per unit equals the sale's gross, qty x cost per unit equals a stock purchase's amount, within five satang (`src/lib/ledger/reconcile.ts`). Enforced in `replace_transaction_items` and in the server actions, which refuse the save and show the difference. A single line at the rounded derived price always passes. The edit form keeps amount and lines in step (qty change keeps gross and recomputes the unit price, price change recomputes gross) and shows each line total. `npm run reconcile:items` lists mismatches; `-- --fix` corrects single-line rows and logs a system correction to `audit_log`; multi-line mismatches are listed for the admin.
- Product picker (`src/components/products/ProductPicker.tsx`): variant first, then the product name, product line as a pill, never truncated. `products.short_name` (admin-set, for example "1 kg packs") is used in ledger rows, chips, Home and Units. Quick entry shows the last-used product and every active product as chips; "More products" opens the picker, which can also create a product (or a sample product under the Samples category). A stock purchase warns when the backlog sits on another variant of the same line. Placeholder products ("Unspecified") are inactive and refused on new rows.
- Units report layout: short single-line period labels ("15 Sept", "Wk 38 · 14–20 Sept", "Sept 2026"), sticky period and product columns with the numbers scrolling inside the card, subtotals and totals behind "Show subtotals" (only when the range spans more than one bucket), zero products behind "Show all products", and a per-product summary strip.
- QA sweep: `npm run test:qa` runs `e2e/qa` (route x role x viewport x language matrix with screenshots, admin and contributor form flows with ledger and report assertions, export comparison against the screen) against a running production build; `npm run qa:report` writes `QA-REPORT.md` from the recorded checks and `e2e/qa/defects.json`. Probe rows carry a `QA-PROBE` note and are removed afterwards.

## How the balance is computed

Only income whose settlement is `received_in_bank` counts.

```
holdings[p] = income received in bank by p
            - expenses paid by p
            + internal transfers received by p
            - internal transfers sent by p
net_profit  = all received income - all expenses
target      = net_profit / 2
delta[p]    = holdings[p] - target
```

A positive delta means that person holds more than their share, so the banner reads "Mike owes Sai ฿X" when Mike's delta is positive. Anything under ฿1 shows as Balanced. The pure function lives in `src/lib/balance.ts` and is unit tested against a hand calculation.

## Roles and soft delete

`profiles.role` is `admin` (Mike) or `contributor` (Sai), and the rules live in Postgres row level security (migration `0004`), not only in the UI:

- Both roles read everything in the business except the audit log, which is admin only.
- Both roles insert entries, payouts, transfers, customers and report uploads; every row is stamped with `created_by`.
- A contributor may update only rows they created, and only for 24 hours. Settings, the exposure limit and profiles are admin only.
- No table has a DELETE policy. "Delete" sets `deleted_at` and `deleted_by`; every query hides such rows, the admin gets a ten second Undo toast and a Recently deleted list under More that restores. There is no reset, clear or bulk delete anywhere in the UI.
- Soft deletes, restores, settings changes and refused attempts (`denied`) all land in the audit log.

`npm run verify:rls` signs in as both founders and proves each rule against the live project.

## My Balance

`src/lib/my-balance.ts`, tested on the seed fixture plus a capital transfer and a 70% early-payout Shopee order:

- Owed to me now reuses the balance formula: `owed_to_me = max(0, target - my_holdings)`.
- Still coming, half mine: 50% of the net of every order not yet in the bank, grouped by platform. Each order's money arrives after the platform's `settlement_lag_days`; when `daily_payout_pct` is under 100 that share arrives on the settlement day (or the order day) and the rest after the lag.
- Exposure = the two above, compared with `businesses.exposure_limit`: green under 80%, amber to 100%, red above with a "Settle before any new stock purchase" banner.
- Today's action is the single transfer that returns both partners to even; "Mark as sent" opens the transfer form prefilled and records nothing until confirmed.
- Transfers carry a `kind`: `settlement` (paying the partner their share) or `capital` (my own money in to buy stock).

## Inventory

`src/lib/inventory/valuation.ts`, tested on: buy 10 boxes at 260, sell 3 at 399, one sample out gives stock 6, value 1,560, COGS 780, gross margin 417, My Balance stock share 780.

- `products` (name, product line, variant, unit, usual cost and price, low stock threshold), `stock_movements` (positive in, negative out; purchase, sale, sample, adjustment, return) and `transaction_items` (product, qty, unit price or cost per sale or purchase line).
- Every sale names at least one product and quantity; saving it writes sale movements. An expense whose category "moves stock" (Stock purchase brings units in, Samples takes them out) requires product, quantity and unit cost and writes the matching movements. Items are replaced through the `replace_transaction_items` RPC under the same role rule as editing the transaction, so no DELETE policy exists anywhere.
- Stock is valued at moving average cost. Reports: stock on hand, low stock (threshold per product, default 3), product profitability (revenue, COGS, gross margin, margin %), samples given. Insights rank products by true gross margin when stock is tracked. My Balance shows "My share of stock on hand (at cost)" apart from cash exposure.
- Import extracts product name, variant and quantity per receipt, fuzzy-matches products and shows a picker for anything unmatched; nothing is saved without a product and quantity.
- Transfers carry a mandatory reason (stock purchase, samples, profit settlement, expense reimbursement, other with a note); the kind is derived in the database.
- Quantities are whole units everywhere (step 1, min 1); the schema rejects fractions.
- `/products` is in the main nav. Admin: create, edit, soft delete (10 s undo, Recently deleted); contributor: view only. Fields: name EN/TH, product line, variant, unit (box, pack, piece, bottle), standard cost, standard sale price, optional platform list prices (TikTok, Shopee, Facebook), low-stock threshold, active, photo (public `product-photos` bucket, JPG/PNG/WebP up to 2 MB, bytes sniffed, path `<business>/<product>.<ext>`), notes. The detail page shows stock on hand, average cost, average vs standard cost, units sold 7 and 30 days, received and gross margin 30 days, last purchase and last sale (`src/lib/inventory/product-stats.ts`).
- Standard prices drive prefills: a sale prefills the platform list price, else the standard sale price, times units; a stock purchase prefills the standard cost; import review fills a missing customer-paid total from the matched product. All editable.
- Reports and Insights show "Expected vs actual margin" per product: expected is (standard price minus standard cost) times units sold, actual is received minus COGS at average cost; flagged when actual is worse by more than 5%.
- Labels: sales show "Sale price per unit" with a read-only "Cost per unit: X (average from stock purchases)"; purchases and samples show only "Cost per unit". A sale never shows a cost field and a purchase never shows a sale price.

## Audit log

Every insert, update and delete on transactions, settlements, payouts, internal transfers, customers and platform settings is written to `audit_log` by a database trigger (`audit_row_change` in migration `0003`), stamped with `auth.uid()`. Updates store only the keys that changed. Because the trigger runs inside Postgres, edits made directly through the Supabase API are logged exactly like edits made in the app. The app records only the actions a trigger cannot see (`confirm_import`, `confirm_payout`, `export`) through the `record_action()` RPC, which fixes actor and business from the session. There is no insert, update or delete policy on `audit_log` for users, so rows cannot be forged or changed through the API. `npm run verify:rls` checks all of that.

## Security

- Row level security on every table, scoped by `current_business_id()`. The service-role key is used only for the cached ledger snapshot (scoped by the verified session's business), storage uploads and the seed and reset scripts.
- Session cookies are `httpOnly`; the app has no browser-side Supabase client.
- Per-request Content Security Policy with a script nonce and `strict-dynamic`, `frame-ancestors 'none'`, plus `X-Frame-Options`, `nosniff`, referrer and permissions policies and HSTS (`src/proxy.ts`, `next.config.ts`).
- Every server action and route handler calls `requireSession()` and validates input with zod; ids are checked as UUIDs before they reach a query.
- The report parser sniffs file magic bytes, caps PDFs at 60 pages and reports at 40 Gemini batches, and accepts one report per user at a time.
- Public signup must stay disabled in the Supabase dashboard (Authentication → Providers → Email). The app signs out any account without a profile, but disabling signup stops account creation altogether.

## Speed

- `vercel.json` pins functions to `sin1`, the same region as the Supabase project.
- Every page is a Server Component. Reads that feed the dashboard, reports, insights and the quick-entry defaults go through one `unstable_cache` snapshot per business (`src/lib/data/ledger.ts`), tagged and expired by every mutation, with a 60 second revalidate as a safety net for changes made outside the app.
- Indexes on `(business_id, type)`, `(business_id, type, date)`, `settlements(status)`, payouts and transfers by date.
- The import module, the quick-entry sheet and the report charts load only when needed.
- Quick entry is optimistic: the sheet closes immediately and the server action runs behind a toast with Undo.

## Insights, without paid AI

`src/lib/insights/compute.ts` is deterministic and tested:

- Product ranking by 30-day profit (net received minus that product's expenses) and margin per unit. The leader is tagged "push this"; a product with zero or negative margin, or with drift, is tagged "review pricing".
- Best platform per product: highest net per order over 90 days.
- Velocity: units per day over 7 days versus 30 days. Rising above 1.2×, falling below 0.8×.
- Margin drift: 7-day net per unit more than 10% below the 30-day average.
- Cash forecast: waiting money per platform, expected using the platform's observed median lag from order date to bank (default 10 days), split into overdue, next 7 days and later.
- Exceptions: payouts not linked to any order, and orders waiting more than 20 days.

The weekly paragraph on the Insights page comes from Gemini's free tier, is cached for a day, and disappears silently if the call fails. Nothing in the app depends on it.

## Setup

1. Create a Supabase project. Apply the schema:

   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

   Migration `0001` creates every table with `business_id`, enables RLS for authenticated members of the business only, adds the customer auto-insert trigger, creates the private `reports` storage bucket, and seeds one business plus default platform settings. Migration `0002` adds `audit_log`, the ledger indexes and `transactions.quantity`.

2. Copy `.env.example` to `.env.local` and fill in the Supabase keys, `MIKISAI_GEMINI_KEY` (the Gemini API key), and the two founder emails and passwords.

3. Install and seed:

   ```bash
   npm install
   npm run seed
   ```

   The seed creates the Mike and Sai accounts, then inserts six sample transactions, one reconciled TikTok payout and one internal transfer. It prints the resulting dashboard numbers and checks them against the hand calculation in `src/lib/fixtures/seed-data.ts`. Use `npm run seed -- --reset` to wipe and reseed.

4. Brand artwork: replace the placeholder `public/brand/ms-monogram.svg` and `public/brand/wordmark.svg` with the final files. They are used in the header, the login page and as the favicon. The PDF header draws the lockup with the embedded Bodoni Moda face.

5. Run:

   ```bash
   npm run dev
   ```

## Verify

```bash
npm run test         # balance, FIFO, report batching, Gemini setup, reports, insights, Excel and PDF exports
npm run typecheck
npm run lint
npm run verify:rls   # anon reads zero rows from every table, founder reads their rows, cross-business insert is rejected, audit rows cannot be edited
```

To check the import flow, sign in, open `/import`, choose the platform, and upload up to 12 receipt screenshots. Each screenshot batch of four becomes one Gemini call (model `gemini-3.6-flash` by default, override with `MIKISAI_GEMINI_MODEL`). Rows land in the review table with `net_amount` taken from the "estimated amount you receive" line (ยอดเงินโดยประมาณ) when present; when absent the net is estimated from platform settings and highlighted in gold.

## Deploy to Vercel

Set the environment variables from `.env.example` (never expose `SUPABASE_SERVICE_ROLE_KEY` or `MIKISAI_GEMINI_KEY` with a `NEXT_PUBLIC_` prefix). The parse route sets `maxDuration = 300`, which needs a plan that allows long function durations for very long reports. `next.config.ts` marks `@react-pdf/renderer` and `exceljs` as external and traces `public/fonts` into the export routes.

## Conventions

- No em-dash character anywhere in copy or code. Use "·" or a comma.
- No color emoji. Glyphs allowed: → ↗ · ✦ ★
- Every user-facing string lives in `src/lib/i18n/dictionary.ts` in both EN and TH.
- Every mutation goes through a server action that calls `recordAudit` and `ledgerChanged`.
- One concern per commit.
