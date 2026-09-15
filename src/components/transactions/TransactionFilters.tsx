import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Translator } from "@/lib/i18n/dictionary";
import { platformName, productName, statusName } from "@/lib/labels";
import { PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES } from "@/lib/types";

type Filters = { type?: string; platform?: string; product?: string; status?: string };

function href(filters: Filters, patch: Partial<Filters>): string {
  const next: Record<string, string | undefined> = { ...filters, ...patch };
  const qs = Object.entries(next)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  return qs ? `/transactions?${qs}` : "/transactions";
}

function Group({ label, options, current, onKey, filters, tr }: { label: string; options: { value: string; label: string }[]; current?: string; onKey: keyof Filters; filters: Filters; tr: (k: "common.all") => string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs uppercase tracking-wide text-plum-faint">{label}</span>
      <Link href={href(filters, { [onKey]: undefined })} className={cn("rounded-full px-2.5 py-1 text-xs border transition-colors", !current ? "bg-plum text-ivory border-plum" : "border-line text-plum-soft hover:border-plum-faint")}>
        {tr("common.all")}
      </Link>
      {options.map((o) => (
        <Link
          key={o.value}
          href={href(filters, { [onKey]: o.value })}
          className={cn("rounded-full px-2.5 py-1 text-xs border transition-colors", current === o.value ? "bg-plum text-ivory border-plum" : "border-line text-plum-soft hover:border-plum-faint")}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function TransactionFilters({ tr, filters }: { tr: Translator; filters: Filters }) {
  return (
    <div className="mb-5 flex flex-col gap-2.5 rounded-card border border-line bg-card px-5 py-4">
      <Group
        label={tr("common.type")}
        onKey="type"
        current={filters.type}
        filters={filters}
        tr={tr}
        options={[
          { value: "income", label: tr("common.income") },
          { value: "expense", label: tr("common.expense") },
        ]}
      />
      <Group label={tr("common.platform")} onKey="platform" current={filters.platform} filters={filters} tr={tr} options={PLATFORMS.map((p) => ({ value: p, label: platformName(tr, p) }))} />
      <Group label={tr("common.product")} onKey="product" current={filters.product} filters={filters} tr={tr} options={PRODUCT_LINES.map((p) => ({ value: p, label: productName(tr, p) }))} />
      <Group label={tr("common.status")} onKey="status" current={filters.status} filters={filters} tr={tr} options={SETTLEMENT_STATUSES.map((s) => ({ value: s, label: statusName(tr, s) }))} />
    </div>
  );
}
