# MikiSai Accounting

Accounting for the two MikiSai founders, built for phones first. Next.js App Router, Supabase (Postgres, Auth, Storage), Vercel in Singapore. All amounts in Thai baht. English by default with a TH toggle.

## What is where

Phones get a bottom tab bar: Home · Add · Ledger · Reports · More. Desktop gets the same routes in the header.

| Route | What it does |
| --- | --- |
| `/` | Who owes whom, money in the bank, expenses, profit, what each platform still owes, recent entries, transfers between the founders |
| Add (the plus button) | Quick-entry sheet from any screen: Income or Expense, amount with the numeric keypad, one-tap platform, product, person and category chips, live "you receive" estimate, customer autocomplete, save with a six second undo, "Save and add another", "Import from screenshot" |
| `/transactions` | Filterable ledger. Tap an entry to edit it; the detail shows who added it and who last edited it |
| `/reports` | This week, this month or a custom period. Profit and loss, sales by product, sales by platform, expenses by category, payout status, who-owes-whom history, customer list. Every report downloads as Excel or PDF |
| `/insights` | Computed from the ledger: product ranking with "push this" or "review pricing" tags, best platform per product, velocity (7 vs 30 days), margin drift alerts, cash forecast per platform, reconciliation exceptions. Optional weekly paragraph from Gemini |
| `/more` | Import, Payouts, Customers, Insights, Audit, Settings, Help, language, sign out |
| `/import` | Paste text or upload screenshots and PDFs of a TikTok, Shopee or Facebook report. Gemini extracts orders into a review table. Nothing is saved until you confirm |
| `/payouts` | Record a bank payout, then match it to orders: FIFO proposal within ±2%, adjust with checkboxes, confirm |
| `/customers` | Built from customer names on sales, with totals and an editable note |
| `/audit` | Every change: who, what, when, before and after. Filter by person, action, record and date. Download as Excel |
| `/settings` | Commission % and fixed fee per platform, used to estimate what you receive when a report has no payout line |
| `/more/help` | Plain-words answers and the five-step tour |
| `/login` | Email and password. No public signup |

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

## Audit log

Every server-side mutation appends a row to `audit_log` (`recordAudit` in `src/lib/audit.ts`): create, update and delete of entries, transfers, payouts, customer notes and settings, plus `confirm_import`, `confirm_payout` and `export`. Rows carry the actor, entity, and a before/after snapshot (updates store only the changed keys). Row level security allows members to read and insert; there is no update or delete policy, so rows cannot be changed through the API. `npm run verify:rls` checks that.

## Speed

- `vercel.json` pins functions to `sin1`, the same region as the Supabase project.
- Every page is a Server Component. Reads that feed the dashboard, reports, insights and the quick-entry defaults go through one `unstable_cache` snapshot per business (`src/lib/data/ledger.ts`), tagged and expired by every mutation.
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
