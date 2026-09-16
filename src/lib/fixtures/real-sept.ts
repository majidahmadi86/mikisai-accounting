/**
 * Ledger shaped like Mike's real mid-September data, used by the
 * reconciliation tests:
 *   14 Sept  samples ฿890: three sample boxes bought and given away (Mike paid)
 *   15 Sept  nine TikTok orders, 5 x 1 box and 4 x 2 boxes, 13 units, all still waiting
 *   16 Sept  stock purchase of 12 boxes at ฿260 (Mike paid), buy to order
 * Standard cost ฿260, sale price ฿399, you receive ฿377 per unit after fees.
 */
import type { StatementsInput } from "@/lib/accounting/statements";
import type { Product, StockMovement } from "@/lib/inventory/valuation";
import type { TransactionItemRow } from "@/lib/inventory/reports";
import type { ReportTx } from "@/lib/reports/build";
import { CATEGORY_ID, SEED_CATEGORIES } from "./seed-data";

export const REAL_TODAY = "2026-09-16";
export const BOX_ID = "00000000-0000-4000-8000-0000000000b1";
const SAMPLE_IDS = ["00000000-0000-4000-8000-0000000000b3", "00000000-0000-4000-8000-0000000000b4", "00000000-0000-4000-8000-0000000000b5"];

export const UNIT_NET = 377;
export const UNIT_GROSS = 399;

const base: Omit<Product, "id" | "name" | "variant" | "default_cost" | "active"> = { name_th: "", product_line: "sugar", unit_label: "box", default_price: UNIT_GROSS, list_prices: { tiktok: UNIT_GROSS }, low_stock_threshold: 3, photo_path: null, notes: "", stock_mode: "buy_to_order" };

export const REAL_PRODUCTS: Product[] = [
  { ...base, id: BOX_ID, name: "Coconut sugar Rung Nirand Amphawa", variant: "10 kg box (1 kg x 10 packs)", default_cost: 260, active: true },
  ...SAMPLE_IDS.map((id, i) => ({ ...base, id, name: `Sample sugar ${"ABC"[i]}`, variant: "10 kg", default_cost: 296.67, default_price: 0, list_prices: {}, active: false })),
];

/** 5 orders of one box, 4 orders of two boxes. */
export const REAL_ORDER_QTYS = [1, 1, 1, 1, 1, 2, 2, 2, 2];

export function realLedger(): StatementsInput {
  const transactions: ReportTx[] = [];
  const items: TransactionItemRow[] = [];
  const movements: StockMovement[] = [];

  // Samples: ฿890 cash, bought and given away.
  transactions.push({ id: "smp", type: "expense", date: "2026-09-14", platform: "other", product_line: "sugar", gross_amount: 890, net_amount: 890, quantity: 3, payer: "mike", received_by: null, category_id: CATEGORY_ID.samples, customer_name: null, note: "Factory samples", created_at: "2026-09-14T09:00:00Z", settlement: null });
  SAMPLE_IDS.forEach((pid, i) => {
    items.push({ transaction_id: "smp", product_id: pid, qty: 1, unit_price: 0, unit_cost: 296.67 });
    movements.push({ id: `smp-in-${i}`, product_id: pid, qty: 1, kind: "purchase", unit_cost: 296.67, transaction_id: "smp", date: "2026-09-14", created_at: "2026-09-14T09:00:00Z" });
    movements.push({ id: `smp-out-${i}`, product_id: pid, qty: -1, kind: "sample", unit_cost: null, transaction_id: "smp", date: "2026-09-14", created_at: "2026-09-14T09:00:00Z" });
  });

  REAL_ORDER_QTYS.forEach((qty, i) => {
    const id = `o${i + 1}`;
    transactions.push({ id, type: "income", date: "2026-09-15", platform: "tiktok", product_line: "sugar", gross_amount: UNIT_GROSS * qty, net_amount: UNIT_NET * qty, quantity: qty, payer: null, received_by: "sai", category_id: null, customer_name: `Customer ${i + 1}`, note: `#58600000000${i} · น้ำตาลมะพร้าว x${qty}`, created_at: `2026-09-15T${String(9 + i).padStart(2, "0")}:00:00Z`, settlement: { status: "pending", settled_at: null, payout_id: null } });
    items.push({ transaction_id: id, product_id: BOX_ID, qty, unit_price: UNIT_GROSS, unit_cost: null });
    movements.push({ id: `m-${id}`, product_id: BOX_ID, qty: -qty, kind: "sale", unit_cost: null, transaction_id: id, date: "2026-09-15", created_at: `2026-09-15T${String(9 + i).padStart(2, "0")}:00:00Z` });
  });

  transactions.push({ id: "buy", type: "expense", date: "2026-09-16", platform: "other", product_line: "sugar", gross_amount: 3120, net_amount: 3120, quantity: 12, payer: "mike", received_by: null, category_id: CATEGORY_ID.stock, customer_name: null, note: "12 boxes from the factory", created_at: "2026-09-16T08:00:00Z", settlement: null });
  items.push({ transaction_id: "buy", product_id: BOX_ID, qty: 12, unit_price: 0, unit_cost: 260 });
  movements.push({ id: "m-buy", product_id: BOX_ID, qty: 12, kind: "purchase", unit_cost: 260, transaction_id: "buy", date: "2026-09-16", created_at: "2026-09-16T08:00:00Z" });

  return { transactions, transfers: [], payouts: [], categories: SEED_CATEGORIES, products: REAL_PRODUCTS, movements, items };
}
