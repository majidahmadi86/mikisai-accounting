/**
 * Live-shaped ledger for the v2.6 reconciliation:
 *   bought 32 boxes (12 of 500 g packs on 16 Sept, 20 of 1 kg packs on 17 Sept) at ฿260, Sai paid
 *   sold 20 boxes of 1 kg packs (13 on 15 Sept, 7 on 16 Sept) at ฿377 net each, all still pending
 *   samples: 3 named sample products bought and given away for ฿890 on 14 Sept, Sai paid
 *   Mike sent Sai ฿2,005 as capital on 16 Sept
 * Expected: on hand 12 (value 3,120), COGS 5,200, samples 890 in both cards,
 * invested 9,210 (Mike 2,005, Sai 7,205), Mike owes Sai 2,600 to be equal.
 */
import type { InvestmentInput } from "@/lib/investment";
import type { Product, StockMovement } from "@/lib/inventory/valuation";
import type { TransactionItemRow } from "@/lib/inventory/reports";
import type { ReportTx } from "@/lib/reports/build";
import { CATEGORY_ID, SEED_CATEGORIES } from "./seed-data";

export const LIVE_TODAY = "2026-09-17";
export const BOX_1KG = "00000000-0000-4000-8000-0000000000b1";
export const BOX_500G = "00000000-0000-4000-8000-0000000000b2";
export const SAMPLE_IDS = ["00000000-0000-4000-8000-0000000000b3", "00000000-0000-4000-8000-0000000000b4", "00000000-0000-4000-8000-0000000000b5"];
export const SAMPLE_COSTS = [296.67, 296.67, 296.66];
export const UNIT_NET = 377;
export const UNIT_GROSS = 399;

const base: Omit<Product, "id" | "name" | "variant" | "short_name" | "default_cost" | "active" | "default_price"> = { name_th: "", product_line: "sugar", unit_label: "box", list_prices: {}, low_stock_threshold: 3, photo_path: null, notes: "", stock_mode: "buy_to_order", expected_net_per_unit: null };

export const LIVE_PRODUCTS: Product[] = [
  { ...base, id: BOX_1KG, name: "Coconut sugar Rung Nirand Amphawa", name_en: "Rung Nirand Amphawa · 100% pure coconut sugar · 10 kg box", name_th: "น้ำตาลมะพร้าวแท้ 100% รุ่งนิรันดร์ อัมพวา 10 กก.", variant: "10 kg box (1 kg x 10 packs)", short_name: "1 kg packs", default_cost: 260, default_price: UNIT_GROSS, active: true, expected_net_per_unit: 311 },
  { ...base, id: BOX_500G, name: "Coconut sugar Rung Nirand Amphawa", name_en: "Rung Nirand Amphawa · 100% pure coconut sugar · 10 kg box", name_th: "น้ำตาลมะพร้าวแท้ 100% รุ่งนิรันดร์ อัมพวา 10 กก.", variant: "10 kg box (500 g x 20 packs)", short_name: "500 g packs", default_cost: 260, default_price: UNIT_GROSS, active: true },
  ...SAMPLE_IDS.map((id, i) => ({ ...base, id, name: `Sample sugar ${"ABC"[i]}`, variant: "10 kg", short_name: "", default_cost: SAMPLE_COSTS[i], default_price: 0, active: true })),
];

export function liveLedger(): InvestmentInput {
  const transactions: ReportTx[] = [];
  const items: TransactionItemRow[] = [];
  const movements: StockMovement[] = [];
  const at = (d: string, h: number) => `${d}T${String(h).padStart(2, "0")}:00:00Z`;

  transactions.push({ id: "smp", type: "expense", date: "2026-09-14", platform: "other", product_line: "sugar", gross_amount: 890, net_amount: 890, quantity: 3, payer: "sai", received_by: null, category_id: CATEGORY_ID.samples, customer_name: null, note: "3 boxes of sample sugar products", created_at: at("2026-09-14", 9), settlement: null });
  SAMPLE_IDS.forEach((pid, i) => {
    items.push({ transaction_id: "smp", product_id: pid, qty: 1, unit_price: 0, unit_cost: SAMPLE_COSTS[i] });
    movements.push({ id: `smp-in-${i}`, product_id: pid, qty: 1, kind: "purchase", unit_cost: SAMPLE_COSTS[i], transaction_id: "smp", date: "2026-09-14", created_at: at("2026-09-14", 9) });
    movements.push({ id: `smp-out-${i}`, product_id: pid, qty: -1, kind: "sample", unit_cost: null, transaction_id: "smp", date: "2026-09-14", created_at: at("2026-09-14", 9) });
  });

  const orders = [...[1, 1, 1, 1, 1, 2, 2, 2, 2].map((q) => ({ q, d: "2026-09-15" })), ...[1, 1, 1, 2, 2].map((q) => ({ q, d: "2026-09-16" }))];
  orders.forEach(({ q, d }, i) => {
    const id = `o${i + 1}`;
    transactions.push({ id, type: "income", date: d, platform: "tiktok", product_line: "sugar", gross_amount: UNIT_GROSS * q, net_amount: UNIT_NET * q, quantity: q, payer: null, received_by: "sai", category_id: null, customer_name: `Customer ${i + 1}`, note: `x${q}`, order_ref: `5860000000${String(i).padStart(2, "0")}`, created_at: at(d, 9 + (i % 10)), settlement: { status: "pending", settled_at: null, payout_id: null, paid_amount: 0 } });
    items.push({ transaction_id: id, product_id: BOX_1KG, qty: q, unit_price: UNIT_GROSS, unit_cost: null });
    movements.push({ id: `m-${id}`, product_id: BOX_1KG, qty: -q, kind: "sale", unit_cost: null, transaction_id: id, date: d, created_at: at(d, 9 + (i % 10)) });
  });

  transactions.push({ id: "buy1", type: "expense", date: "2026-09-16", platform: "other", product_line: "sugar", gross_amount: 3120, net_amount: 3120, quantity: 12, payer: "sai", received_by: null, category_id: CATEGORY_ID.stock, customer_name: null, note: "Sai paid to buy product", created_at: at("2026-09-16", 8), settlement: null });
  items.push({ transaction_id: "buy1", product_id: BOX_500G, qty: 12, unit_price: 0, unit_cost: 260 });
  movements.push({ id: "m-buy1", product_id: BOX_500G, qty: 12, kind: "purchase", unit_cost: 260, transaction_id: "buy1", date: "2026-09-16", created_at: at("2026-09-16", 8) });
  transactions.push({ id: "buy2", type: "expense", date: "2026-09-17", platform: "other", product_line: "sugar", gross_amount: 5200, net_amount: 5200, quantity: 20, payer: "sai", received_by: null, category_id: CATEGORY_ID.stock, customer_name: null, note: "20 boxes", created_at: at("2026-09-17", 8), settlement: null });
  items.push({ transaction_id: "buy2", product_id: BOX_1KG, qty: 20, unit_price: 0, unit_cost: 260 });
  movements.push({ id: "m-buy2", product_id: BOX_1KG, qty: 20, kind: "purchase", unit_cost: 260, transaction_id: "buy2", date: "2026-09-17", created_at: at("2026-09-17", 8) });

  return {
    transactions,
    transfers: [{ id: "cap1", date: "2026-09-16", from_person: "mike", to_person: "sai", amount: 2005, note: "Mike sent Sai money for stock", kind: "capital", reason: "for_stock" }],
    payouts: [],
    categories: SEED_CATEGORIES,
    products: LIVE_PRODUCTS,
    movements,
    items,
  };
}
