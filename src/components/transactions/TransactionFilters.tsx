import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Translator } from "@/lib/i18n/dictionary";
import { platformName, productName, statusName } from "@/lib/labels";
import { PLATFORMS, PRODUCT_LINES, SETTLEMENT_STATUSES } from "@/lib/types";

type Filters = { type?: string; platform?: string; product?: string; status?: string; category?: string; from?: string; to?: string; product_id?: string; customer?: string };

function href(filters: Filters, patch: Partial<Filters>): string {
  const next: Record<string, string | undefined> = { ...filters, ...patch };
  const qs = Object.entries(next)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  return qs ? `/transactions?${qs}` : "/transactions";
}

const chip = "inline-flex min-h-10 items-center rounded-full border px-3.5 text-xs font-medium transition-colors";

function Group({ label, options, current, onKey, filters, tr }: { label: string; options: { value: string; label: string }[]; current?: string; onKey: keyof Filters; filters: Filters; tr: (k: "common.all") => string }) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <Link href={href(filters, { [onKey]: undefined })} className={cn(chip, !current ? "border-plum bg-plum text-ivory" : "border-line bg-card text-plum-soft hover:border-plum-faint")}>
          {tr("common.all")}
        </Link>
        {options.map((o) => (
          <Link key={o.value} href={href(filters, { [onKey]: o.value })} className={cn(chip, current === o.value ? "border-plum bg-plum text-ivory" : "border-line bg-card text-plum-soft hover:border-plum-faint")}>
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function TransactionFilters({ tr, filters }: { tr: Translator; filters: Filters }) {
  return (
    <div className="mb-5 grid gap-3 rounded-card border border-line bg-card px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
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
