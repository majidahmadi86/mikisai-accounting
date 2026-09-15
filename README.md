# MikiSai Accounting

Shared ledger for the two MikiSai founders. Next.js App Router, Supabase (Postgres, Auth, Storage), Vercel. All amounts in Thai baht. English by default with a TH toggle.

## Routes

| Route | What it does |
| --- | --- |
| `/` | Balance banner (who owes whom), stat cards, pending per platform, recent activity, internal transfers |
| `/transactions` | Filterable ledger, add and edit income or expenses. New income auto-creates a pending settlement |
| `/import` | Paste text or upload screenshots and PDFs of a TikTok, Shopee or Facebook report. Gemini extracts orders into a review table. Nothing is saved until you confirm |
| `/payouts` | Record a bank payout, then reconcile it: FIFO proposal within ±2%, adjust with checkboxes, confirm |
| `/customers` | Auto-built from customer names on income, with totals and an editable note |
| `/settings` | Commission % and fixed fee per platform, used to estimate net when a report has no payout line |
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

## Setup

1. Create a Supabase project. Apply the schema:

   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

   The migration creates every table with `business_id`, enables RLS for authenticated members of the business only, adds the customer auto-insert trigger, creates the private `reports` storage bucket, and seeds one business plus default platform settings.

2. Copy `.env.example` to `.env.local` and fill in the Supabase keys, `MIKISAI_GEMINI_KEY` (the Gemini API key), and the two founder emails and passwords.

3. Install and seed:

   ```bash
   npm install
   npm run seed
   ```

   The seed creates the Mike and Sai accounts, then inserts six sample transactions, one reconciled TikTok payout and one internal transfer. It prints the resulting dashboard numbers and checks them against the hand calculation in `src/lib/fixtures/seed-data.ts`. Use `npm run seed -- --reset` to wipe and reseed.

4. Run:

   ```bash
   npm run dev
   ```

## Verify

```bash
npm run test         # balance math, FIFO match, report batching
npm run typecheck
npm run lint
npm run verify:rls   # anon key reads zero rows from every table, founder reads their rows, cross-business insert is rejected
```

To check the import flow, sign in, open `/import`, choose the platform, and upload up to 12 receipt screenshots. Each screenshot batch of four becomes one Gemini call (model `gemini-3.6-flash` by default, override with `MIKISAI_GEMINI_MODEL`). Rows land in the review table with `net_amount` taken from the "estimated amount you receive" line (ยอดเงินโดยประมาณ) when present; when absent the net is estimated from platform settings and highlighted in gold.

## Deploy to Vercel

Set the four environment variables from `.env.example` (never expose `SUPABASE_SERVICE_ROLE_KEY` or `MIKISAI_GEMINI_KEY` with a `NEXT_PUBLIC_` prefix). The parse route sets `maxDuration = 300`, which needs a plan that allows long function durations for very long reports.

## Conventions

- No em-dash character anywhere in copy or code. Use "·" or a comma.
- No color emoji. Glyphs allowed: → ↗ · ✦ ★
- One concern per commit.
- AI extraction never writes to `transactions` directly. The only path is the review table plus the `commitImport` action.
