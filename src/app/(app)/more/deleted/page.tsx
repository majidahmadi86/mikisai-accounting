import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { RestoreButton } from "@/components/ui/RestoreButton";
import { ExpandableNote } from "@/components/ui/ExpandableNote";
import type { SoftDeleteEntity } from "@/lib/soft-delete";
import { requireAdmin } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { categoryName, platformName, platformTone } from "@/lib/labels";
import { formatDate, formatDateTime, thb } from "@/lib/money";
import { num, type Person, type TransferReason } from "@/lib/types";

type Row = { entity: SoftDeleteEntity; id: string; title: string; detail: string; amount: number | null; deletedAt: string; deletedBy: string | null; platform?: string };

export default async function RecentlyDeletedPage() {
  const [session, locale] = await Promise.all([requireAdmin("transaction", "recently-deleted"), getLocale()]);
  const tr = t(locale);
  const { supabase } = session;

  const [tx, po, tf, cu, profiles] = await Promise.all([
    supabase.from("transactions").select("id, type, date, platform, net_amount, customer_name, category, note, deleted_at, deleted_by").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(200),
    supabase.from("payouts").select("id, date, platform, amount_received, note, deleted_at, deleted_by").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(100),
    supabase.from("internal_transfers").select("id, date, from_person, to_person, amount, kind, reason, note, deleted_at, deleted_by").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(100),
    supabase.from("customers").select("id, name, platform, deleted_at, deleted_by").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id, display_name"),
  ]);
  const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.display_name as string]));

  const rows: Row[] = [
    ...(tx.data ?? []).map((r): Row => ({
      entity: "transaction",
      id: r.id,
      title: r.type === "income" ? r.customer_name || platformName(tr, r.platform) : r.category ? categoryName(tr, r.category) : tr("common.expense"),
      detail: `${r.type === "income" ? tr("common.income") : tr("common.expense")} · ${formatDate(r.date, locale)}${r.note ? ` · ${r.note}` : ""}`,
      amount: (r.type === "expense" ? -1 : 1) * num(r.net_amount),
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by,
      platform: r.platform,
    })),
    ...(po.data ?? []).map((r): Row => ({ entity: "payout", id: r.id, title: tr("deleted.payout"), detail: `${formatDate(r.date, locale)}${r.note ? ` · ${r.note}` : ""}`, amount: num(r.amount_received), deletedAt: r.deleted_at, deletedBy: r.deleted_by, platform: r.platform })),
    ...(tf.data ?? []).map((r): Row => ({ entity: "internal_transfer", id: r.id, title: `${tr(`common.${r.from_person as Person}`)} → ${tr(`common.${r.to_person as Person}`)}`, detail: `${tr(`transfer.reason.${r.reason as TransferReason}`)} · ${formatDate(r.date, locale)}${r.note ? ` · ${r.note}` : ""}`, amount: num(r.amount), deletedAt: r.deleted_at, deletedBy: r.deleted_by })),
    ...(cu.data ?? []).map((r): Row => ({ entity: "customer", id: r.id, title: r.name, detail: tr("deleted.customer"), amount: null, deletedAt: r.deleted_at, deletedBy: r.deleted_by, platform: r.platform })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return (
    <div className="max-w-3xl">
      <PageHeader title={tr("deleted.title")} subtitle={tr("deleted.subtitle")} />
      {rows.length === 0 ? (
        <EmptyState title={tr("deleted.empty")} body={tr("deleted.emptyBody")} />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={`${r.entity}-${r.id}`} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-plum">
                  <Pill tone="neutral">{tr(`deleted.${r.entity}`)}</Pill>
                  <span className="truncate">{r.title}</span>
                  {r.platform ? <Pill tone={platformTone(r.platform as "tiktok")}>{platformName(tr, r.platform as "tiktok")}</Pill> : null}
                </p>
                <ExpandableNote text={r.detail} className="mt-0.5 text-xs text-plum-soft" />
                <p className="text-xs text-plum-faint">{tr("deleted.by", { name: r.deletedBy ? (names.get(r.deletedBy) ?? "?") : "·", when: formatDateTime(r.deletedAt, locale) })}</p>
              </div>
              {r.amount !== null ? <span className={`tabular font-medium ${r.amount < 0 ? "text-plum-soft" : "text-plum"}`}>{thb(r.amount)}</span> : null}
              <RestoreButton entity={r.entity} id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
