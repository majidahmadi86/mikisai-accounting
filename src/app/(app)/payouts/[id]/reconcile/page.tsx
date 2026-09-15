import { notFound } from "next/navigation";
import { ReconcilePanel, type ReconcileCandidate } from "@/components/payouts/ReconcilePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { requireSession } from "@/lib/auth";
import { proposeFifoMatch, type MatchCandidate } from "@/lib/fifo";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone } from "@/lib/labels";
import { formatDate, thb } from "@/lib/money";
import { num, type Payout, type SettlementStatus } from "@/lib/types";

export default async function ReconcilePage({ params }: PageProps<"/payouts/[id]/reconcile">) {
  const [{ id }, { supabase }, locale] = await Promise.all([params, requireSession(), getLocale()]);
  const tr = t(locale);

  const { data: payoutRow } = await supabase.from("payouts").select("*").eq("id", id).maybeSingle();
  if (!payoutRow) notFound();
  const payout: Payout = { ...(payoutRow as Payout), amount_received: num(payoutRow.amount_received) };

  // Unpaid orders on this platform, plus anything already linked to this payout.
  const { data: rows } = await supabase
    .from("settlements")
    .select("id, transaction_id, status, payout_id, transactions!inner(date, created_at, net_amount, gross_amount, customer_name, platform, product_line)")
    .eq("transactions.platform", payout.platform)
    .or(`payout_id.eq.${id},and(payout_id.is.null,status.in.(pending,settled_not_withdrawn))`);

  const candidates: ReconcileCandidate[] = (rows ?? [])
    .map((s) => {
      const tx = Array.isArray(s.transactions) ? s.transactions[0] : s.transactions;
      return {
        settlement_id: s.id,
        transaction_id: s.transaction_id,
        status: s.status as SettlementStatus,
        linked: s.payout_id === id,
        date: tx?.date ?? "",
        created_at: tx?.created_at ?? "",
        net_amount: num(tx?.net_amount),
        gross_amount: num(tx?.gross_amount),
        customer_name: tx?.customer_name ?? null,
        product_line: tx?.product_line ?? "other",
      };
    })
    .sort((a, b) => (a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date)));

  const alreadyLinked = candidates.filter((c) => c.linked).map((c) => c.settlement_id);
  const proposal = alreadyLinked.length
    ? {
        selectedIds: alreadyLinked,
        total: candidates.filter((c) => c.linked).reduce((sum, c) => sum + c.net_amount, 0),
        difference: 0,
        matched: true,
        tolerance: 0.02,
      }
    : proposeFifoMatch(candidates as MatchCandidate[], payout.amount_received);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={tr("payouts.reconcileTitle")}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Pill tone={platformTone(payout.platform)}>{platformName(tr, payout.platform)}</Pill>
            <span>{formatDate(payout.date, locale)}</span>
            <span>·</span>
            <span className="font-medium text-plum tabular">{thb(payout.amount_received)}</span>
            <span>·</span>
            <span>{tr(`common.${payout.received_by}`)}</span>
          </span>
        }
      />
      <p className="mb-5 text-sm text-plum-soft">{tr("payouts.reconcileSubtitle", { platform: platformName(tr, payout.platform) })}</p>
      <ReconcilePanel payoutId={payout.id} amountReceived={payout.amount_received} candidates={candidates} initialSelected={proposal.selectedIds} locale={locale} />
    </div>
  );
}
