import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { DownloadIcon } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { requireSession } from "@/lib/auth";
import { auditChanges, auditQueryString, parseAuditFilters, queryAudit } from "@/lib/audit-query";
import { getLocale, t } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/money";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, type AuditAction } from "@/lib/types";

const actionTone: Record<AuditAction, PillTone> = { create: "success", update: "lavender", delete: "berry-soft", confirm_import: "plum", confirm_payout: "success", export: "neutral" };

function entityHref(row: { entity_type: string; entity_id: string | null }): string | null {
  if (!row.entity_id) return null;
  if (row.entity_type === "transaction") return `/transactions/${row.entity_id}/edit`;
  if (row.entity_type === "payout") return `/payouts/${row.entity_id}/reconcile`;
  return null;
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const [sp, { supabase }, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const filters = parseAuditFilters(sp);
  const { rows, names } = await queryAudit(supabase, filters);
  const qs = auditQueryString(filters);

  return (
    <div>
      <PageHeader
        title={tr("audit.title")}
        subtitle={tr("audit.subtitle")}
        action={
          rows.length ? (
            <a href={`/audit/export${qs ? `?${qs}` : ""}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-medium text-plum hover:border-berry hover:text-berry">
              <DownloadIcon className="h-4 w-4" /> {tr("audit.export")}
            </a>
          ) : null
        }
      />

      <form method="get" action="/audit" className="mb-5 grid gap-3 rounded-card border border-line bg-card px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-6">
        <label className="block">
          <span className="eyebrow mb-1 block">{tr("audit.who")}</span>
          <Select name="user" defaultValue={filters.user ?? ""}>
            <option value="">{tr("audit.anyone")}</option>
            {Array.from(names.entries()).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">{tr("audit.action")}</span>
          <Select name="action" defaultValue={filters.action ?? ""}>
            <option value="">{tr("audit.anyAction")}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {tr(`audit.action.${a}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">{tr("audit.entity")}</span>
          <Select name="entity" defaultValue={filters.entity ?? ""}>
            <option value="">{tr("audit.anyEntity")}</option>
            {AUDIT_ENTITIES.map((e) => (
              <option key={e} value={e}>
                {tr(`audit.entity.${e}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">{tr("reports.from")}</span>
          <Input type="date" name="from" defaultValue={filters.from ?? ""} />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">{tr("reports.to")}</span>
          <Input type="date" name="to" defaultValue={filters.to ?? ""} />
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full">
            {tr("audit.filter")}
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={tr("audit.empty")} body={tr("audit.emptyBody")} />
      ) : (
        <>
          <p className="mb-3 text-xs text-plum-faint">{tr("audit.showing", { n: rows.length })}</p>
          <ul className="space-y-2">
            {rows.map((row) => {
              const changes = auditChanges(row);
              const href = entityHref(row);
              return (
                <li key={row.id} className="rounded-card border border-line bg-card px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Pill tone={actionTone[row.action]}>{tr(`audit.action.${row.action}`)}</Pill>
                    <span className="font-medium text-plum">{names.get(row.actor_user_id) ?? "?"}</span>
                    <span className="text-plum-soft">
                      {tr(`audit.entity.${row.entity_type}` as "audit.entity.transaction")}
                      {href ? (
                        <>
                          {" "}
                          <Link href={href} className="text-berry hover:underline">
                            {row.entity_id?.slice(0, 8)} →
                          </Link>
                        </>
                      ) : row.entity_id ? (
                        <span className="text-plum-faint"> {row.entity_id.slice(0, 8)}</span>
                      ) : null}
                    </span>
                    <span className="ml-auto text-xs text-plum-faint">{formatDateTime(row.created_at, locale)}</span>
                  </div>
                  {changes.length ? (
                    <details className="group mt-2">
                      <summary className="cursor-pointer list-none text-xs text-berry">
                        {changes.length} {row.action === "update" ? `${tr("audit.before")} → ${tr("audit.after")}` : tr("audit.what").toLowerCase()} <span className="inline-block transition-transform group-open:rotate-90">→</span>
                      </summary>
                      <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                        {changes.map((c) => (
                          <li key={c.field} className="rounded-lg bg-ivory-deep/70 px-3 py-1.5 tabular">
                            <span className="text-plum-faint">{c.field}</span>{" "}
                            {row.action === "update" ? (
                              <>
                                <span className="text-plum-soft line-through">{c.before || "·"}</span> → <span className="text-plum">{c.after || "·"}</span>
                              </>
                            ) : (
                              <span className="text-plum">{c.before || c.after}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
