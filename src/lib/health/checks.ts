import { checkBooks, type StatementsInput } from "@/lib/accounting/statements";
import type { TransactionItemRow } from "@/lib/inventory/reports";
import { unitSanity } from "@/lib/inventory/quantity";
import { buildUnitsReport } from "@/lib/inventory/units";
import { valueStock } from "@/lib/inventory/valuation";
import { round2 } from "@/lib/money";
import { buildReports } from "@/lib/reports/build";
import { daysBetween, thisMonth } from "@/lib/reports/period";
import type { Role } from "@/lib/types";
import { buildInvestment } from "@/lib/investment";
import { buildStockPage } from "@/lib/inventory/stock-page";
import { buildMyBalance } from "@/lib/my-balance";
import { inventoryValue, stockPositions, whoOwesWhom, type TruthInput, type TruthTransfer } from "@/lib/truth";
import { buildBalanceSheet } from "@/lib/accounting/statements";

export const HEALTH_KEYS = ["qty_amount", "negative_stocked", "income_no_product", "stock_purchase_no_items", "expense_no_category", "payout_unmatched", "transfer_no_reason", "duplicate_order_ids", "late_contributor_edit", "no_expected_net", "orphan_movements", "consistency", "report_totals"] as const;
export type HealthKey = (typeof HEALTH_KEYS)[number];

export type HealthIssue = { id: string; label: string; href: string | null; detail?: string };
export type HealthCheck = { key: HealthKey; count: number; issues: HealthIssue[]; adminOnly: boolean; skipped: boolean };
export type HealthResult = { ranAt: string; checks: HealthCheck[]; issues: number; ok: boolean };

export type AuditRowLite = { action: string; entity_type: string; entity_id: string | null; actor_user_id: string | null; created_at: string; before: Record<string, unknown> | null };

export type HealthInput = Omit<StatementsInput, "transfers"> & {
  items: TransactionItemRow[];
  transfers: TruthTransfer[];
  /** Audit rows (updates) plus each actor's role; null when the caller cannot read the audit log. */
  audit: { rows: AuditRowLite[]; roles: Map<string, Role> } | null;
};

export const UNMATCHED_PAYOUT_DAYS = 20;
const CENT = 0.011;

function check(key: HealthKey, issues: HealthIssue[], opts: { adminOnly?: boolean; skipped?: boolean } = {}): HealthCheck {
  return { key, count: issues.length, issues, adminOnly: opts.adminOnly ?? false, skipped: opts.skipped ?? false };
}

/** Every automated check, each with the rows behind its count and a link to open each row. */
export function runHealthChecks(input: HealthInput, today: string, ranAt = new Date().toISOString()): HealthResult {
  const products = new Map(input.products.map((p) => [p.id, p]));
  const itemsByTx = new Map<string, TransactionItemRow[]>();
  for (const it of input.items) itemsByTx.set(it.transaction_id, [...(itemsByTx.get(it.transaction_id) ?? []), it]);
  const income = input.transactions.filter((t) => t.type === "income");
  const expenses = input.transactions.filter((t) => t.type === "expense");
  const txHref = (id: string) => `/transactions/${id}/edit`;
  const txLabel = (t: { date: string; net_amount: number; customer_name: string | null; note: string }) => `${t.date} · ฿${t.net_amount.toFixed(2)}${t.customer_name ? ` · ${t.customer_name}` : ""}`;

  // 1. Amount does not fit the unit count against the product's standard price.
  const qtyAmount: HealthIssue[] = [];
  for (const t of income) {
    const items = itemsByTx.get(t.id) ?? [];
    if (items.length !== 1) continue;
    const p = products.get(items[0].product_id);
    const w = p ? unitSanity(t.net_amount, items[0].qty, p.default_price) : null;
    if (w) qtyAmount.push({ id: t.id, label: txLabel(t), href: txHref(t.id), detail: `qty ${w.entered}, looks like ${w.looksLike}` });
  }

  // 2. Stocked products below zero.
  const valuation = valueStock(input.products, input.movements);
  const negativeStocked = valuation.products
    .filter((r) => r.product.stock_mode === "stocked" && r.onHand < 0)
    .map((r): HealthIssue => ({ id: r.product.id, label: `${r.product.name}${r.product.variant ? ` · ${r.product.variant}` : ""}`, href: `/products/${r.product.id}`, detail: `${r.onHand}` }));

  // 3. Sales without a product line.
  const noProduct = income.filter((t) => !(itemsByTx.get(t.id) ?? []).length).map((t): HealthIssue => ({ id: t.id, label: txLabel(t), href: txHref(t.id) }));

  // 4. Stock purchases without product lines cannot become inventory.
  const purchaseCategories = new Set(input.categories.filter((c) => c.stock_effect === "purchase").map((c) => c.id));
  const purchaseNoItems = expenses.filter((t) => t.category_id && purchaseCategories.has(t.category_id) && !(itemsByTx.get(t.id) ?? []).length).map((t): HealthIssue => ({ id: t.id, label: txLabel(t), href: txHref(t.id) }));

  // 5. Expenses without a category.
  const known = new Set(input.categories.map((c) => c.id));
  const noCategory = expenses.filter((t) => !t.category_id || !known.has(t.category_id)).map((t): HealthIssue => ({ id: t.id, label: txLabel(t), href: txHref(t.id) }));

  // 6. Payouts nothing was matched to, older than 20 days.
  const matchedPayouts = new Set(income.map((t) => t.settlement?.payout_id).filter(Boolean));
  const unmatched = input.payouts
    .filter((p) => !matchedPayouts.has(p.id) && daysBetween(p.date, today) > UNMATCHED_PAYOUT_DAYS)
    .map((p): HealthIssue => ({ id: p.id, label: `${p.date} · ${p.platform} · ฿${p.amount_received.toFixed(2)}`, href: `/payouts/${p.id}/reconcile`, detail: `${daysBetween(p.date, today)} days` }));

  // 7. Transfers without a reason.
  const noReason = input.transfers.filter((t) => !("reason" in t) || !(t as { reason?: string | null }).reason).map((t): HealthIssue => ({ id: t.id, label: `${t.date} · ฿${t.amount.toFixed(2)}`, href: `/transfers/${t.id}/edit` }));

  // 8. The same platform order id on two sales of the same platform.
  const byOrder = new Map<string, string[]>();
  for (const t of income) {
    const ref = t.order_ref?.trim();
    if (!ref) continue;
    const key = `${t.platform}:${ref}`;
    byOrder.set(key, [...(byOrder.get(key) ?? []), t.id]);
  }
  const duplicates: HealthIssue[] = [];
  for (const [key, ids] of byOrder) {
    if (ids.length < 2) continue;
    for (const id of ids) duplicates.push({ id, label: `#${key.split(":")[1]}`, href: txHref(id), detail: `${ids.length} rows` });
  }

  // 9. A contributor edited a row more than 24 hours after it was created. RLS forbids this; the count must be zero.
  let lateEdits: HealthIssue[] = [];
  if (input.audit) {
    const roles = input.audit.roles;
    lateEdits = input.audit.rows
      .filter((r) => r.action === "update" && r.actor_user_id && roles.get(r.actor_user_id) === "contributor")
      .filter((r) => {
        const created = typeof r.before?.created_at === "string" ? Date.parse(r.before.created_at) : NaN;
        return Number.isFinite(created) && Date.parse(r.created_at) - created > 24 * 3600 * 1000;
      })
      .map((r): HealthIssue => ({ id: r.entity_id ?? r.created_at, label: `${r.entity_type} · ${r.created_at.slice(0, 16).replace("T", " ")}`, href: r.entity_type === "transaction" && r.entity_id ? txHref(r.entity_id) : "/audit" }));
  }

  // 10. Products selling regularly without an honest expectation of what a unit brings in.
  const saleIds = new Set(income.map((t) => t.id));
  const salesPerProduct = new Map<string, number>();
  for (const it of input.items) if (saleIds.has(it.transaction_id)) salesPerProduct.set(it.product_id, (salesPerProduct.get(it.product_id) ?? 0) + 1);
  const noExpectedNet = input.products
    .filter((p) => !p.deleted_at && (p.expected_net_per_unit == null || p.expected_net_per_unit <= 0) && (salesPerProduct.get(p.id) ?? 0) >= 5)
    .map((p): HealthIssue => ({ id: p.id, label: `${p.name}${p.variant ? ` · ${p.variant}` : ""}`, href: `/products/${p.id}/edit`, detail: `${salesPerProduct.get(p.id)} sales` }));

  // 11. Stock moves without a live payment: a movement or line whose transaction is deleted or missing.
  const liveIds = new Set(input.transactions.map((t) => t.id));
  const orphanMovements: HealthIssue[] = input.movements
    .filter((m) => m.transaction_id && !liveIds.has(m.transaction_id))
    .map((m): HealthIssue => {
      const p = products.get(m.product_id);
      return { id: m.id, label: `${m.date} · ${p ? p.name : m.product_id} · ${m.kind} ${m.qty > 0 ? "+" : ""}${m.qty}`, href: "/more/deleted", detail: "no live transaction" };
    });
  for (const it of input.items) {
    if (!liveIds.has(it.transaction_id)) orphanMovements.push({ id: `item-${it.transaction_id}-${it.product_id}`, label: `${products.get(it.product_id)?.name ?? it.product_id} · line x${it.qty}`, href: "/more/deleted", detail: "no live transaction" });
  }

  // 12. Consistency: every page must show the same who-owes-whom and the same stock.
  const consistency = consistencyMismatches(input, today);

  // 13. Every report total equals the ledger sum for this month, and the books balance.
  const totals = reportTotalMismatches(input, today);

  const checks: HealthCheck[] = [
    check("qty_amount", qtyAmount),
    check("negative_stocked", negativeStocked),
    check("income_no_product", noProduct),
    check("stock_purchase_no_items", purchaseNoItems),
    check("expense_no_category", noCategory),
    check("payout_unmatched", unmatched),
    check("transfer_no_reason", noReason),
    check("duplicate_order_ids", duplicates),
    check("late_contributor_edit", lateEdits, { adminOnly: true, skipped: !input.audit }),
    check("no_expected_net", noExpectedNet),
    check("orphan_movements", orphanMovements),
    check("consistency", consistency),
    check("report_totals", totals),
  ];
  const issues = checks.reduce((a, c) => a + c.count, 0);
  return { ranAt, checks, issues, ok: issues === 0 };
}

/** The equalities that must hold between pages: one number, everywhere. */
export function consistencyMismatches(input: TruthInput, today: string): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const truth = whoOwesWhom(input, today);
  const owesAmount = (o: { from: string; to: string; amount: number } | null) => (o ? `${o.from}->${o.to} ${o.amount.toFixed(2)}` : "even");
  const home = owesAmount(truth.owes);
  const mine = buildMyBalance({ transactions: input.transactions, transfers: input.transfers, settings: [], exposureLimit: 0 }, "mike", today);
  const myBalance = owesAmount(mine.owedToMe > 0 ? { from: "sai", to: "mike", amount: mine.owedToMe } : mine.iOwe > 0 ? { from: "mike", to: "sai", amount: mine.iOwe } : null);
  const investment = owesAmount(buildInvestment(input, today).settle);
  const period = thisMonth(today);
  const report = owesAmount(buildReports(input, period).owesHistory.at(-1)?.owes ?? null);
  const sheet = buildBalanceSheet(input, today).partnerBalance;
  const sheetOwes = owesAmount(Math.abs(sheet.mike) >= 1 ? (sheet.mike > 0 ? { from: "mike", to: "sai", amount: sheet.mike } : { from: "sai", to: "mike", amount: sheet.sai }) : null);
  for (const [name, value, href] of [["My Balance", myBalance, "/balance"], ["Investment", investment, "/investment"], ["Who owes whom report", report, "/reports"], ["Balance sheet", sheetOwes, "/reports"]] as const) {
    if (value !== home) issues.push({ id: `owes:${name}`, label: `${name} disagrees with Home`, href, detail: `Home ${home} · ${name} ${value}` });
  }
  const positions = stockPositions(input);
  const page = buildStockPage({ products: input.products, movements: input.movements, items: input.items, names: new Map() });
  for (const card of page.cards) {
    const p = positions.find((x) => x.product.id === card.stock.product.id);
    if (!p || card.stock.onHand !== p.onHand || card.stock.backlog !== p.backlog || card.stock.value !== p.value) issues.push({ id: `stock:${card.stock.product.id}`, label: `Stock page disagrees for ${card.stock.product.name}`, href: "/stock" });
  }
  const sheetInventory = buildBalanceSheet(input, today).inventory;
  const inventory = inventoryValue(input, today);
  if (Math.abs(sheetInventory - inventory) >= CENT) issues.push({ id: "stock:balance-sheet", label: "Balance sheet inventory disagrees with Stock", href: "/reports", detail: `Stock ${inventory.toFixed(2)} · Balance sheet ${sheetInventory.toFixed(2)}` });
  return issues;
}

/** Each report card's total against the raw ledger sum for the same period. */
export function reportTotalMismatches(input: HealthInput, today: string): HealthIssue[] {
  const period = thisMonth(today);
  const bundle = buildReports(input, period);
  const tx = input.transactions.filter((t) => t.date >= period.from && t.date <= period.to);
  const income = tx.filter((t) => t.type === "income");
  const expenses = tx.filter((t) => t.type === "expense");
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const ledgerNet = sum(income.map((t) => t.net_amount));
  const ledgerPaid = sum(expenses.map((t) => t.net_amount));
  const units = buildUnitsReport({ products: input.products, movements: input.movements, items: input.items, sales: income.map((t) => ({ id: t.id, date: t.date })) }, period, "month");
  const saleIds = new Set(income.map((t) => t.id));
  const ledgerUnits = input.items.filter((i) => saleIds.has(i.transaction_id) && input.products.some((p) => p.id === i.product_id && !p.deleted_at)).reduce((a, i) => a + i.qty, 0);

  const pairs: { key: string; expected: number; actual: number }[] = [
    { key: "pl.revenue", expected: ledgerNet, actual: bundle.accrual.revenue },
    { key: "pl.cash", expected: ledgerNet, actual: bundle.pl.net },
    { key: "platform.net", expected: ledgerNet, actual: sum(bundle.byPlatform.map((r) => r.net)) },
    { key: "product.net", expected: ledgerNet, actual: sum(bundle.byProduct.map((r) => r.net)) },
    { key: "settlement.total", expected: ledgerNet, actual: sum(bundle.settlement.map((r) => r.total)) },
    { key: "category.amount", expected: ledgerPaid, actual: sum(bundle.byCategory.map((r) => r.amount)) },
    { key: "cashflow.out", expected: ledgerPaid, actual: bundle.cashFlow.cashOut },
    { key: "units.sold", expected: ledgerUnits, actual: units.totals.reduce((a, r) => a + r.unitsSold, 0) },
    { key: "profitability.revenue", expected: sum(income.filter((t) => input.items.some((i) => i.transaction_id === t.id)).map((t) => t.net_amount)), actual: sum((bundle.inventory?.profitability ?? []).map((r) => r.revenue)) },
    { key: "pl.profit_vs_reconciliation", expected: bundle.accrual.profit, actual: round2(bundle.reconciliation.inStock + bundle.reconciliation.pending + bundle.reconciliation.cash) },
  ];
  const issues = pairs.filter((p) => Math.abs(p.expected - p.actual) >= CENT).map((p): HealthIssue => ({ id: p.key, label: p.key, href: "/reports", detail: `ledger ${p.expected.toFixed(2)} · report ${p.actual.toFixed(2)}` }));
  for (const c of checkBooks(input, today).checks) {
    if (!c.ok) issues.push({ id: c.key, label: c.key, href: "/more/check-books", detail: `expected ${c.expected.toFixed(2)} · actual ${c.actual.toFixed(2)}` });
  }
  return issues;
}
