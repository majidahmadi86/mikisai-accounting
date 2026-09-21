import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitRows, type AuditEntry, type CommitRow } from "@/lib/import/commit";
import { applyOrderStatus } from "@/lib/ledger/status";
import { matchPayoutExact } from "@/lib/payouts/confirm";
import { num, type Person } from "@/lib/types";
import type { SkuEntry, Statement } from "./statement";
import { planStatement, type LedgerOrder, type StatementPlan, type StatementPlanInput } from "./statement-plan";
import type { ReturnLoss, SettledOrder, WalletEvent } from "./wallet";

export const RETURN_COST_CATEGORY = "Return cost";

type Db = SupabaseClient;

/** Everything the plan needs to know about the ledger, the stored statements and the wallet so far. */
export async function statementContext(db: Db, businessId: string, statement: Statement, receivedBy: Person): Promise<StatementPlanInput> {
  const refs = Array.from(new Set(statement.rows.map((r) => (r.type === "refund" ? (r.related_order_id ?? r.id) : r.id))));
  const [biz, skuRows, factRows, eventRows, payoutRows, pendingRows] = await Promise.all([
    db.from("businesses").select("start_date").eq("id", businessId).maybeSingle(),
    db.from("tiktok_sku_map").select("sku_key, product_id, multiplier").eq("business_id", businessId),
    db.from("order_statements").select("order_ref, kind, settled_date, settlement_amount, pre_business").eq("business_id", businessId),
    db.from("wallet_events").select("kind, reference, event_date, amount, bank_suffix, received_by").eq("business_id", businessId),
    db.from("payouts").select("external_ref").eq("business_id", businessId).eq("platform", "tiktok").not("external_ref", "is", null).is("deleted_at", null),
    db.from("transactions").select("order_ref, date, net_amount, settlements!inner(status, deleted_at)").eq("business_id", businessId).eq("type", "income").eq("platform", "tiktok").eq("status", "active").is("deleted_at", null).eq("settlements.status", "pending").is("settlements.deleted_at", null),
  ]);

  const ledger = new Map<string, LedgerOrder>();
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await db.from("transactions").select("id, order_ref, date, net_amount, status, settlements(status, deleted_at)").eq("business_id", businessId).eq("type", "income").eq("platform", "tiktok").in("order_ref", refs.slice(i, i + 200)).is("deleted_at", null);
    for (const row of data ?? []) {
      const list: { status: string; deleted_at: string | null }[] = Array.isArray(row.settlements) ? row.settlements : row.settlements ? [row.settlements] : [];
      const s = list.find((x) => !x.deleted_at) ?? null;
      if (row.order_ref) ledger.set(row.order_ref as string, { id: row.id as string, order_ref: row.order_ref as string, date: row.date as string, net_amount: num(row.net_amount), status: (row.status ?? "active") as LedgerOrder["status"], settlement_status: (s?.status ?? null) as LedgerOrder["settlement_status"] });
    }
  }

  const skus = new Map<string, SkuEntry>((skuRows.data ?? []).map((r) => [r.sku_key as string, { product_id: (r.product_id as string | null) ?? null, multiplier: Number(r.multiplier) || 1 }]));
  const fallbackProductId = Array.from(skus.entries()).find(([k, v]) => k.startsWith("id:") && v.multiplier === 1 && v.product_id)?.[1].product_id ?? null;
  const facts = factRows.data ?? [];
  const settled: SettledOrder[] = facts.filter((f) => f.kind === "order" && f.settled_date).map((f) => ({ order_ref: f.order_ref as string, date: f.settled_date as string, net: num(f.settlement_amount), business: !f.pre_business }));
  const losses: ReturnLoss[] = facts.filter((f) => f.kind === "refund" && f.settled_date && !f.pre_business && num(f.settlement_amount) < 0).map((f) => ({ order_ref: f.order_ref as string, date: f.settled_date as string, loss: Math.abs(num(f.settlement_amount)) }));
  const events: WalletEvent[] = (eventRows.data ?? []).map((e) => ({ kind: e.kind as WalletEvent["kind"], reference: e.reference as string, date: e.event_date as string, amount: num(e.amount), bank_suffix: (e.bank_suffix as string) ?? "", received_by: e.received_by as Person }));

  return {
    statement,
    startDate: (biz.data?.start_date as string | undefined) ?? "2026-09-15",
    receivedBy,
    skus,
    fallbackProductId,
    ledger,
    knownFacts: new Set(facts.map((f) => `${f.order_ref}:${f.kind}`)),
    history: { settled, losses, events },
    knownPayouts: new Set((payoutRows.data ?? []).map((p) => p.external_ref as string)),
    unsettled: (pendingRows.data ?? []).filter((r) => r.order_ref).map((r) => ({ order_ref: r.order_ref as string, date: r.date as string, value: num(r.net_amount) })),
  };
}

export type StatementOutcome = { ok: true; created: number; settled: number; fixed: number; refunds: number; payouts: number; pre_business: number } | { ok: false; error: string };

/**
 * Applies a statement plan. New orders go through commitRows like every other
 * import; refunds through mark_order_status; withdrawals become payouts that
 * pay exactly the orders the wallet replay names. Nothing here computes a
 * business number: it only records what TikTok said.
 */
export async function applyStatement(db: Db, businessId: string, statement: Statement, opts: { receivedBy: Person; createdBy: string | null; fileName: string; uploadId: string | null; audit: (entry: AuditEntry) => Promise<void> }): Promise<StatementOutcome> {
  const plan: StatementPlan = planStatement(await statementContext(db, businessId, statement, opts.receivedBy));
  const by = opts.createdBy ? { created_by: opts.createdBy } : {};

  // 1. Orders the ledger does not have yet.
  let created = 0;
  if (plan.create.length) {
    const { data: products } = await db.from("products").select("id, product_line").eq("business_id", businessId);
    const lineOf = new Map((products ?? []).map((p) => [p.id as string, p.product_line as CommitRow["product_line"]]));
    const rows: CommitRow[] = plan.create.map((c) => ({ date: c.date, platform: "tiktok", product_line: lineOf.get(c.product_id) ?? "sugar", gross_amount: c.gross_amount, net_amount: c.net_amount, received_by: opts.receivedBy, status: "settled_not_withdrawn", customer_name: null, order_id: c.order_ref, note: null, product_id: c.product_id, quantity: c.quantity, tags: c.qty_inferred ? ["qty_inferred"] : [], order_status: "active", refund_amount: null }));
    for (let i = 0; i < rows.length; i += 400) {
      const result = await commitRows(db, businessId, { rows: rows.slice(i, i + 400), status_changes: [], payouts: [], upload_ids: [], source: "csv", skipped: 0, details: { statement: opts.fileName } }, { createdBy: opts.createdBy, audit: opts.audit });
      if (!result.ok) return { ok: false, error: result.error };
      created += result.inserted;
    }
  }

  // The ledger ids of every order this statement speaks about, including the ones just created.
  const refs = Array.from(new Set(plan.facts.map((f) => f.order_ref)));
  const idOf = new Map<string, { id: string; net: number; status: string }>();
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await db.from("transactions").select("id, order_ref, net_amount, status").eq("business_id", businessId).eq("type", "income").eq("platform", "tiktok").in("order_ref", refs.slice(i, i + 200)).is("deleted_at", null);
    for (const r of data ?? []) idOf.set(r.order_ref as string, { id: r.id as string, net: num(r.net_amount), status: (r.status ?? "active") as string });
  }

  // 2. What TikTok really paid replaces an estimate that is more than one baht off.
  for (const fix of plan.netFixes) await db.from("transactions").update({ net_amount: fix.new }).eq("id", fix.transaction_id).eq("business_id", businessId);

  // 3. Settled: paid by TikTok, still in the wallet, on the day the statement says.
  const settledAt = new Map<string, string | null>([...plan.settle.map((s): [string, string | null] => [s.order_ref, s.settled_date]), ...plan.create.map((c): [string, string | null] => [c.order_ref, c.settled_date])]);
  for (const [ref, date] of settledAt) {
    const tx = idOf.get(ref);
    if (!tx) continue;
    const stamp = date ? `${date}T00:00:00Z` : null;
    await db.from("settlements").update({ status: "settled_not_withdrawn", settled_at: stamp }).eq("transaction_id", tx.id).eq("business_id", businessId).eq("status", "pending").is("deleted_at", null);
    if (stamp) await db.from("settlements").update({ settled_at: stamp }).eq("transaction_id", tx.id).eq("business_id", businessId).eq("status", "settled_not_withdrawn").is("settled_at", null).is("deleted_at", null);
  }

  // 4. Returns: the order is refunded in full, and what the return cost is an expense, never a sale.
  let refunds = 0;
  if (plan.refunds.length) {
    const { data: cat } = await db.from("expense_categories").select("id").eq("business_id", businessId).ilike("name_en", RETURN_COST_CATEGORY).maybeSingle();
    for (const r of plan.refunds) {
      const tx = idOf.get(r.order_ref) ?? (r.transaction_id ? { id: r.transaction_id, net: 0, status: "active" } : null);
      if (tx && tx.status === "active") await applyOrderStatus(db, tx.id, { status: "refunded", date: r.date, reason: "from TikTok statement", refund_amount: tx.net > 0 ? tx.net : null }, null);
      if (r.loss > 0 && cat) {
        const { error } = await db.from("transactions").insert({ business_id: businessId, type: "expense", date: r.date, platform: "tiktok", product_line: "sugar", gross_amount: r.loss, net_amount: r.loss, quantity: 1, payer: opts.receivedBy, received_by: null, category_id: cat.id, customer_name: null, order_ref: null, note: `Return cost · order #${r.order_ref}`, ...by });
        if (!error) refunds += 1;
      }
    }
  }

  // 5. The statement's own facts per order: the fee breakdown, the weight, what the ledger said before.
  if (plan.facts.length) {
    const rows = plan.facts.map((f) => ({ ...f, business_id: businessId, transaction_id: f.pre_business ? null : (idOf.get(f.order_ref)?.id ?? f.transaction_id) }));
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await db.from("order_statements").upsert(rows.slice(i, i + 400), { onConflict: "business_id,order_ref,kind", ignoreDuplicates: true });
      if (error) return { ok: false, error: `statements: ${error.message}` };
    }
  }

  // 6. The wallet.
  if (plan.walletEvents.length) {
    const { error } = await db.from("wallet_events").upsert(
      plan.walletEvents.map((e) => ({ business_id: businessId, kind: e.kind, reference: e.reference, event_date: e.date, amount: e.amount, status: e.status ?? "", bank_suffix: e.bank_suffix ?? "", received_by: e.received_by ?? opts.receivedBy })),
      { onConflict: "business_id,kind,reference", ignoreDuplicates: true },
    );
    if (error) return { ok: false, error: `wallet: ${error.message}` };
  }

  // 7. Withdrawals: money in the bank. Each pays the orders the wallet replay names; the rest of it is an advance or is from before the business.
  let payouts = 0;
  for (const w of plan.payouts) {
    const { data: dup } = await db.from("payouts").select("id").eq("business_id", businessId).eq("platform", "tiktok").eq("external_ref", w.reference).is("deleted_at", null).maybeSingle();
    if (dup) continue;
    const note = `TikTok withdrawal ${w.reference}${w.bank_suffix ? ` · bank ····${w.bank_suffix}` : ""}`;
    const { data: payout, error } = await db.from("payouts").insert({ business_id: businessId, date: w.date, platform: "tiktok", amount_received: w.amount, received_by: w.received_by, note, external_ref: w.reference, non_order_amount: Math.round((w.advance + w.other) * 100) / 100, ...by }).select("id").single();
    if (error || !payout) continue;
    const result = w.orders.length ? await matchPayoutExact(db, businessId, payout.id as string, w.orders) : null;
    await opts.audit({ action: "confirm_payout", entity_type: "payout", entity_id: payout.id as string, before: null, after: { settlement_ids: result?.settlementIds ?? [], orders: result?.orders ?? 0, amount_received: w.amount, advance: w.advance, not_business: w.other, source: "tiktok statement" } });
    payouts += 1;
  }

  // 8. Which days this statement covers.
  if (plan.period) {
    const { data: same } = await db.from("tiktok_statements").select("id").eq("business_id", businessId).eq("period_from", plan.period.from).eq("period_to", plan.period.to).eq("order_rows", statement.rows.length).eq("wallet_rows", statement.wallet.length).limit(1);
    if (!same?.length) await db.from("tiktok_statements").insert({ business_id: businessId, period_from: plan.period.from, period_to: plan.period.to, file_name: opts.fileName.slice(0, 200), upload_id: opts.uploadId, order_rows: statement.rows.length, wallet_rows: statement.wallet.length, ...by });
  }

  const touched = created + plan.settle.length + plan.netFixes.length + refunds + payouts + plan.preBusiness.count;
  if (touched) {
    await db.from("import_runs").insert({ business_id: businessId, source: "csv", orders: created, cancellations: refunds, payouts, skipped: plan.alreadyKnown, details: { statement: opts.fileName, period: plan.period, settled: plan.settle.length, fixed: plan.netFixes.length, pre_business: plan.preBusiness.count, advance_balance: plan.wallet.advanceBalance }, ...by });
  }
  return { ok: true, created, settled: plan.settle.length, fixed: plan.netFixes.length, refunds, payouts, pre_business: plan.preBusiness.count };
}
