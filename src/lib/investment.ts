import type { StatementsInput } from "@/lib/accounting/statements";
import { buildAccrualPL } from "@/lib/accounting/statements";
import { whoOwesWhom } from "@/lib/truth";
import type { ExpenseCategory } from "@/lib/categories";
import type { TransactionItemRow } from "@/lib/inventory/reports";
import { shortProductName } from "@/lib/inventory/units";
import type { Product } from "@/lib/inventory/valuation";
import { round2 } from "@/lib/money";
import type { ReportTransfer } from "@/lib/reports/build";
import type { Person, TransferKind, TransferReason } from "@/lib/types";

/**
 * What each partner put into the business. A contribution is money a
 * partner paid out for the business: an expense they paid directly, or a
 * capital transfer they sent to the other partner (who then spent it). A
 * capital transfer received is therefore taken off the receiver's own
 * figure, so the total always equals what the business spent.
 */
export type Contribution = {
  id: string;
  date: string;
  who: Person;
  kind: "expense" | "capital";
  label: string;
  details: string;
  amount: number;
  /** Running contribution of this partner after this row, oldest first. */
  running: number;
  href: string;
};

export type Investment = {
  total: number;
  byPerson: Record<Person, number>;
  fairShare: number;
  /** Who owes whom so both have put in the same. */
  settle: { from: Person; to: Person; amount: number } | null;
  returns: { cashReceived: number; profitToDate: number; pending: number };
  contributions: Contribution[];
};

export type InvestmentInput = StatementsInput & {
  transfers: (ReportTransfer & { kind: TransferKind; reason: TransferReason })[];
  items: TransactionItemRow[];
  categories: ExpenseCategory[];
  products: Product[];
};

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

export function buildInvestment(input: InvestmentInput, asOf: string, locale: "en" | "th" = "en", labels: { category: (c: ExpenseCategory | undefined) => string; reason: (r: TransferReason) => string } = { category: (c) => c?.name_en ?? "", reason: (r) => r }): Investment {
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const categories = new Map(input.categories.map((c) => [c.id, c]));
  const itemsByTx = new Map<string, TransactionItemRow[]>();
  for (const it of input.items) itemsByTx.set(it.transaction_id, [...(itemsByTx.get(it.transaction_id) ?? []), it]);

  const rows: Omit<Contribution, "running">[] = [];
  for (const t of input.transactions) {
    if (t.type !== "expense" || !t.payer || t.date > asOf) continue;
    const items = itemsByTx.get(t.id) ?? [];
    const details = items.map((i) => `${byId.has(i.product_id) ? shortProductName(byId.get(i.product_id)!, locale) : "?"} × ${i.qty}`).join(", ") || t.note;
    rows.push({ id: t.id, date: t.date, who: t.payer, kind: "expense", label: labels.category(categories.get(t.category_id ?? "")), details, amount: t.net_amount, href: `/transactions/${t.id}/edit` });
  }
  const byPerson: Record<Person, number> = { mike: 0, sai: 0 };
  // Display only: money sent for anything but the other's profit share counts as put in. It never changes who owes whom.
  for (const tr of input.transfers) {
    if (tr.reason === "profit_share" || tr.date > asOf) continue;
    rows.push({ id: tr.id, date: tr.date, who: tr.from_person, kind: "capital", label: labels.reason(tr.reason), details: tr.note, amount: tr.amount, href: `/transfers/${tr.id}/edit` });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const running: Record<Person, number> = { ...byPerson };
  const contributions: Contribution[] = rows.map((r) => {
    running[r.who] = round2(running[r.who] + r.amount);
    return { ...r, running: running[r.who] };
  });
  byPerson.mike = running.mike;
  byPerson.sai = running.sai;
  const total = round2(byPerson.mike + byPerson.sai);
  // "To be equal" is the one who-owes-whom number, cash basis, transfers already counted.
  const truth = whoOwesWhom(input, asOf);
  const fairShare = truth.fairShareOfCosts;
  const settle = truth.owes;

  const income = input.transactions.filter((t) => t.type === "income" && t.date <= asOf);
  const cashReceived = sum(income.map((t) => (t.settlement?.status === "received_in_bank" ? t.net_amount : Math.min(t.net_amount, t.settlement?.paid_amount ?? 0))));
  const pending = sum(income.map((t) => (t.settlement?.status === "received_in_bank" ? 0 : round2(t.net_amount - Math.min(t.net_amount, t.settlement?.paid_amount ?? 0)))));
  const profitToDate = buildAccrualPL(input, { key: "custom", from: "0000-01-01", to: asOf }).profit;

  return { total, byPerson, fairShare, settle, returns: { cashReceived, profitToDate, pending }, contributions: contributions.reverse() };
}
