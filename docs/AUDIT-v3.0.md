# Simplification audit · v3.0

Read-only inventory taken on 20 Sept 2026 before any change. The test for every screen: Sai can use it without asking Mike what anything means. Target week: Sai records what she paid for when she buys stock, nothing else; Mike exports, drops, confirms, and reads.

Marks: **D** daily · **W** weekly · **N** never (or a duplicate of something that stays). Nothing marked for removal holds data: every removal below is a screen, a button, a card or a sentence. No table, column or row is deleted; the rows behind removed screens stay reachable from the page named in "Where it lives now".

## 1. Doors that start an action (before)

| Action | Doors found | After |
|---|---|---|
| Add a sale | 11: tab bar +, header Add, Transactions "Add income", "Add", "Add the first entry", Home "Add income", Home "Add the first entry", Home "Quick order", Customers "Add income", Reports and Insights "Add the first entry"; inside the sheet an Income tab AND an Order tab; plus the unlinked page `/transactions/new` | 1: Add, then **Sale** |
| Add an expense | 4: Transactions "Add expense", Home "Add expense", sheet Expense tab, `/transactions/new?type=expense` | 1: Add, then **Expense** (Stock purchase and Samples are its first two chips) |
| Money between the founders | 5 different forms: Home panel "Record an internal transfer", sheet transfer mode, My Balance "Mark as sent" (own modal form), Investment "Record sent" (saves with no form), transfer edit page | 1 form: Add, then **Money moved**. My Balance and Investment open that same form already filled in. The edit page stays for changing a saved one. |
| Payout received | 4: Home "Record payout", Home reminder card, Payouts header button, Payouts empty state, all leading to the page `/payouts/new` | 1: Add, then **Payout received** (saving opens the matching page) |
| Open Import | 6: Home bottom row, Home routine card, Home "Last import" line, More row, sheet "Import from screenshot", Connect TikTok link | Import is a page: the nav More list, the routine card on Home, and the Connect TikTok link when orders wait. Not in the Add sheet. |
| Search | header overlay and the page `/search` | Overlay is the door; the page stays only as "see every result". |
| Stock correction | Stock page form and the same form on each product page | Stock page only (W, admin). |

## 2. Screens

| Screen | Item | Mark | Decision | Where it lives now |
|---|---|---|---|---|
| Add sheet | Income tab (customer paid, estimate, net override) | N, duplicate | Remove. Sale is the former quick order: order ID, qty, you receive (prefilled), where the money is; More holds customer, another product, date, platform, note. | Add · Sale |
| Add sheet | Order tab | D | Becomes Sale | Add · Sale |
| Add sheet | Expense tab | W (Sai) | Stays; Stock purchase and Samples first | Add · Expense |
| Add sheet | Transfer mode (only reachable from Home) | W | Becomes the third chip | Add · Money moved |
| Add sheet | "Import from screenshot" link | N here | Remove | Import page |
| Add sheet | 14 always-visible field hints | N | Behind info icons | info icon beside each label |
| Home | Balance banner with two partner cards | D | Stays | Home |
| Home | Routine card (admin) with three numbered steps | D / N | Card stays as "Tonight: export, drop, confirm" with last run and counts; the three steps go (they are on the Import panel itself) | Home, Import |
| Home | Routine for a contributor | missing | New: "Record what you paid for today", one button, opens Expense on Stock purchase | Home |
| Home | "Last import" line; counted a hand-typed sale as an import | D | Inside the routine card; a quick sale is no longer an import | Home |
| Home | TikTok connection line | N here | Remove from Home | More · Connect TikTok |
| Home | Install card (contributor) | once | Moves | Import (contributor) |
| Home | Payout reminder card | N, duplicate | Remove | Payouts, My Balance "Still coming" |
| Home | Stock strip | D | Stays | Home |
| Home | Yesterday card | W | Moves | Reports · Units |
| Home | Data health line | W | Remove from Home | More · Data health (nightly run is unchanged) |
| Home | Four stat tiles | N, duplicate | Remove | Reports · Profit and loss |
| Home | "Waiting on platforms" card | N, duplicate | Remove | My Balance "Still coming", Reports · Payout status |
| Home | "Recent activity" card | N, duplicate | Remove | Ledger |
| Home | "Internal transfers" list and Record button | N, duplicate | Moves. Found while executing: Investment lists only the transfers that count as money put in, so the full list (every transfer, each opening its edit page, where delete stays) now sits on My Balance as "Money moved". | My Balance |
| Home | Bottom row of five buttons | N, duplicates | Remove | Add |
| Transactions | "Add income", "Add expense", empty-state Add buttons | N, duplicates | Remove | Add |
| Customers, Reports, Insights | empty-state Add buttons | N, duplicates | Remove | Add |
| `/transactions/new` | full-page form, linked from nowhere | N | Remove the page and its create action. The same form stays for editing. | Add · Sale, Add · Expense |
| `/payouts/new` | full-page form | N, duplicate | Remove the page; Payouts loses its "Record payout" buttons | Add · Payout received |
| My Balance | "Mark as sent" modal with its own transfer form | W, duplicate form | Button stays, opens Money moved filled in | Add · Money moved |
| Investment | "Record sent" that saved without showing a form | W, duplicate | Button stays, opens Money moved filled in | Add · Money moved |
| Product page | Stock correction form | N, duplicate | Remove | Stock (admin) |
| Import | Nightly panel and TikTok review queue shown to a contributor | N for Sai | Admin only; a contributor sees the share-to-app card and screenshots | Import |
| More | one description sentence per row | N | Remove; the titles say it | More |
| Search page | hint repeated in the empty state | N | Remove the repeat | Search |
| Help, Tour | 4 questions, 5 steps | once | Stay behind More · Help; tour text follows the new Add sheet | More · Help |
| Settings, Check books, Audit, Recently deleted, Connect TikTok | admin pages | W or less | Stay, admin only where they already are | More |
| Dictionary | 8 `nav.*` and 7 `tips.*` strings used nowhere | N | Remove | |

## 3. Words

Twenty-eight English strings carried a term a non-accountant would not say (settlement 4, settle 6, allocate 1, clawback 6, SKU 4, "net" 10, gross 2). They become: paid out, paid, taken back, matched, product, "you receive", "customer paid". Status pills name the platform: "Waiting for TikTok", "Paid by TikTok, still in wallet", "In the bank", "Cancelled", "Refunded". Thai follows the same rule.

## 4. Explanations

Every page keeps its title and one plain sentence. Field hints and card subtitles move behind the info icon beside their label (one change in `Field` and `CardHeader` covers all forms and cards). Free-standing explanatory paragraphs on Payouts, the matching page, Investment, My Balance, Settings, Insights, Import and Data health move behind info icons or go. Lines that state a fact about the data ("17 entries", "Checked 20 Sept 16:43", "Stock on hand ฿0.00") stay.

## 5. What is not removed

Reports, Units, Insights, Stock, Products, Customers, Payouts, the matching page, My Balance, Investment, Data health and the four admin pages all stay: they are Mike's reading. Edit pages stay. Soft delete, restore and the audit history are untouched.
