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
