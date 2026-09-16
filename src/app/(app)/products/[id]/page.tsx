import Image from "next/image";
import { notFound } from "next/navigation";
import { adjustStock } from "@/app/(app)/settings/products-actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { InfoTip } from "@/components/ui/InfoTip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { StockPill } from "@/components/products/StockPill";
import { SoftDeleteButton } from "@/components/ui/SoftDeleteButton";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { photoUrl } from "@/lib/inventory/photos";
import { productDetailStats, type ListPrices } from "@/lib/inventory/product-stats";
import { valueStock } from "@/lib/inventory/valuation";
import { productName } from "@/lib/labels";
import { formatDate, thb, todayIso } from "@/lib/money";
import { UUID } from "@/lib/soft-delete";
import { cn } from "@/lib/cn";

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "ok" | "warn" | "berry" }) {
  return (
    <div className={cn("rounded-xl px-4 py-3", tone === "warn" ? "bg-warning-tint" : tone === "ok" ? "bg-success-tint" : tone === "berry" ? "bg-berry-tint" : "bg-ivory-deep/70")}>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {hint ? <InfoTip text={hint} /> : null}
      </div>
      <p className={cn("mt-1 text-xl font-medium tabular", tone === "berry" ? "text-berry" : "text-plum")}>{value}</p>
    </div>
  );
}

export default async function ProductDetailPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const [{ id }, sp, session, locale] = await Promise.all([params, searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  if (!UUID.test(id)) notFound();
  const admin = session.profile.role === "admin";
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const valuation = valueStock(snapshot.products, snapshot.movements);
  const row = valuation.products.find((r) => r.product.id === id);
  if (!row) notFound();
  const p = row.product;
  const today = todayIso();
  const stats = productDetailStats(
    row,
    snapshot.items,
    snapshot.transactions.filter((tx) => tx.type === "income").map((tx) => ({ id: tx.id, date: tx.date, net_amount: tx.net_amount })),
    snapshot.movements,
    valuation.cogsByTransaction,
    today,
  );
  const list = (p.list_prices ?? {}) as ListPrices;
  const name = locale === "th" && p.name_th ? p.name_th : p.name;

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={`${productName(tr, p.product_line)} · ${tr(`products.unit.${p.unit_label as "box"}`)}`}
        title={name}
        subtitle={p.variant || undefined}
        action={
          admin ? (
            <>
              <ButtonLink href={`/products/${p.id}/edit`} variant="secondary">
                {tr("common.edit")}
              </ButtonLink>
              <SoftDeleteButton entity="product" id={p.id} afterHref="/products" />
            </>
          ) : null
        }
      />
      {sp.saved ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("common.saved")}</p> : null}
      {sp.error ? <p className="mb-4 rounded-xl bg-berry-tint px-4 py-3 text-sm text-berry">{sp.error === "denied" ? tr("roles.denied") : tr("common.error")}</p> : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {p.photo_path ? <Image src={photoUrl(p.photo_path)} alt="" width={96} height={96} unoptimized className="h-24 w-24 rounded-2xl object-cover" /> : null}
        <div className="flex flex-wrap gap-2">
          <Pill tone={p.active ? "success" : "neutral"}>{p.active ? tr("settings.active") : tr("settings.inactive")}</Pill>
          <Pill tone="lavender">{tr(`products.stockMode.${p.stock_mode}`)}</Pill>
          {row.low ? <Pill tone="warning">{tr("reports.lowStock")}</Pill> : null}
          {row.backlog > 0 ? <StockPill row={row} tr={tr} /> : null}
          {p.name_th && locale !== "th" ? <Pill tone="lavender">{p.name_th}</Pill> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label={row.backlog > 0 ? tr("products.backlogStat") : tr("reports.onHand")}
          value={row.backlog > 0 ? `${row.backlog} ${tr(`products.unit.${p.unit_label as "box"}`)}` : `${stats.onHand} ${tr(`products.unit.${p.unit_label as "box"}`)}`}
          hint={row.backlog > 0 ? tr("dashboard.toBuyHint") : tr("products.onHandHint")}
          tone={row.backlog > 0 ? (p.stock_mode === "buy_to_order" ? "berry" : "warn") : row.low ? "warn" : undefined}
        />
        <Stat label={tr("reports.avgCost")} value={thb(stats.avgCost)} hint={tr("products.avgCostHint")} />
        <Stat
          label={tr("products.costVariance")}
          value={`${stats.costVariance > 0 ? "+" : ""}${thb(stats.costVariance)}${stats.costVariancePct !== null ? ` · ${stats.costVariancePct}%` : ""}`}
          hint={tr("products.costVarianceHint", { standard: thb(stats.standardCost) })}
          tone={stats.costVariance > 0 ? "warn" : stats.onHand > 0 ? "ok" : undefined}
        />
        <Stat label={tr("products.sold7")} value={stats.sold7} hint={tr("products.sold7Hint")} />
        <Stat label={tr("products.sold30")} value={stats.sold30} hint={tr("products.sold30Hint")} />
        <Stat label={tr("products.revenue30")} value={thb(stats.revenue30)} hint={tr("products.revenue30Hint")} />
        <Stat label={tr("products.margin30")} value={thb(stats.grossMargin30)} hint={tr("products.margin30Hint", { cogs: thb(stats.cogs30) })} tone={stats.grossMargin30 < 0 ? "warn" : undefined} />
        <Stat label={tr("products.lastPurchase")} value={stats.lastPurchase ? formatDate(stats.lastPurchase, locale) : "·"} />
        <Stat label={tr("products.lastSale")} value={stats.lastSale ? formatDate(stats.lastSale, locale) : "·"} />
      </div>

      <Card className="mt-4">
        <CardHeader title={tr("products.prices")} subtitle={tr("products.pricesDesc")} />
        <dl className="grid grid-cols-2 gap-3 px-5 pb-5 text-sm sm:grid-cols-4 sm:px-6 sm:pb-6">
          <div>
            <dt className="eyebrow">{tr("products.standardCost")}</dt>
            <dd className="tabular text-plum">{thb(p.default_cost)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{tr("products.standardPrice")}</dt>
            <dd className="tabular text-plum">{thb(p.default_price)}</dd>
          </div>
          {(["tiktok", "shopee", "fb"] as const).map((pl) => (
            <div key={pl}>
              <dt className="eyebrow">{tr(`platform.${pl}`)}</dt>
              <dd className="tabular text-plum">{list[pl] ? thb(list[pl]!) : <span className="text-plum-faint">·</span>}</dd>
            </div>
          ))}
          <div>
            <dt className="eyebrow">{tr("products.threshold")}</dt>
            <dd className="tabular text-plum">{p.low_stock_threshold}</dd>
          </div>
        </dl>
        {p.notes ? <p className="border-t border-line px-5 py-4 text-sm text-plum-soft sm:px-6">{p.notes}</p> : null}
      </Card>

      {admin ? (
        <Card className="mt-4">
          <CardHeader title={tr("inventory.adjust")} subtitle={tr("products.adjustDesc")} />
          <form action={adjustStock} className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-4 sm:px-6 sm:pb-6">
            <input type="hidden" name="product_id" value={p.id} />
            <Field label={tr("inventory.qtyDelta")} htmlFor="adj-qty" hint={tr("products.qtyDeltaHint")}>
              <Input id="adj-qty" name="qty" type="number" inputMode="numeric" step={1} required className="tabular" />
            </Field>
            <Field label={tr("inventory.unitCost")} htmlFor="adj-cost" hint={tr("inventory.unitCostHintSample")}>
              <Input id="adj-cost" name="unit_cost" type="number" inputMode="decimal" step="0.01" min={0} className="tabular" />
            </Field>
            <Field label={tr("common.date")} htmlFor="adj-date">
              <Input id="adj-date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label={tr("common.note")} htmlFor="adj-note" hint={tr("inventory.adjustHint")}>
              <Input id="adj-note" name="note" />
            </Field>
            <div className="col-span-full">
              <Button type="submit" variant="secondary">
                {tr("inventory.adjustSave")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
