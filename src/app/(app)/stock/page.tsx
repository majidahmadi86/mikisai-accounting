import Link from "next/link";
import { adjustStock } from "@/app/(app)/settings/products-actions";
import { StockPill } from "@/components/products/StockPill";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { DownloadIcon, OpenIcon } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { IconLink, RowDetail, Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { buildStockPage } from "@/lib/inventory/stock-page";
import { shortProductName } from "@/lib/inventory/units";
import { productLine } from "@/lib/search";
import { formatDate, thb, todayIso } from "@/lib/money";
import { cn } from "@/lib/cn";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

const kindTone = { purchase: "success", sale: "berry-soft", sample: "lavender", adjustment: "warning", return: "neutral" } as const;

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const admin = session.profile.role === "admin";
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const { data: profiles } = await session.supabase.from("profiles").select("id, display_name");
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  const filter = {
    product: typeof sp.product === "string" && UUID.test(sp.product) ? sp.product : null,
    from: typeof sp.from === "string" && ISO.test(sp.from) ? sp.from : null,
    to: typeof sp.to === "string" && ISO.test(sp.to) ? sp.to : null,
  };
  const { cards, history } = buildStockPage({ products: snapshot.products, movements: snapshot.movements, items: snapshot.items, names }, filter);
  const qs = new URLSearchParams();
  if (filter.product) qs.set("product", filter.product);
  if (filter.from) qs.set("from", filter.from);
  if (filter.to) qs.set("to", filter.to);
  const exportQs = qs.toString();
  const linkClass = "inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-card px-3 text-xs font-medium text-plum-soft hover:border-berry hover:text-berry";
  const kindName = (k: keyof typeof kindTone) => tr(`stock.kind.${k}`);

  return (
    <div>
      <PageHeader
        title={tr("stock.title")}
        subtitle={tr("stock.subtitle")}
        action={
          <div className="flex gap-2">
            <a href={`/reports/export?format=xlsx&report=movements&${exportQs}`} className={linkClass}>
              <DownloadIcon className="h-4 w-4" /> {tr("reports.xlsx")}
            </a>
            <a href={`/reports/export?format=pdf&report=movements&${exportQs}`} className={linkClass}>
              <DownloadIcon className="h-4 w-4" /> {tr("reports.pdf")}
            </a>
          </div>
        }
      />
      {sp.saved ? <p className="mb-4 rounded-xl bg-success-tint px-4 py-3 text-sm text-success">{tr("common.saved")}</p> : null}
      {sp.error ? <p className="mb-4 rounded-xl bg-berry-tint px-4 py-3 text-sm text-berry">{sp.error === "denied" ? tr("roles.denied") : tr("common.error")}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => {
          const p = c.stock.product;
          const backlog = c.stock.backlog > 0;
          return (
            <Card key={p.id} className={cn("px-5 py-4", !p.active && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-40">
                  <Link href={`/products/${p.id}`} className="block truncate text-base font-medium text-plum hover:underline">
                    {shortProductName(p, locale)}
                  </Link>
                  <p className="truncate text-xs text-plum-faint">
                    {p.name}
                    {p.variant ? ` · ${p.variant}` : ""}
                  </p>
                </div>
                <StockPill row={c.stock} tr={tr} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 min-[400px]:grid-cols-4">
                {(
                  [
                    { label: tr("stock.bought"), value: c.bought, berry: false },
                    { label: tr("stock.sold"), value: c.sold, berry: false },
                    { label: tr("stock.samples"), value: c.samples, berry: false },
                    { label: backlog ? tr("products.backlogStat") : tr("reports.onHand"), value: backlog ? c.stock.backlog : c.stock.onHand, berry: backlog },
                  ] as { label: string; value: number; berry: boolean }[]
                ).map((x) => (
                  <div key={x.label} className={cn("rounded-xl px-3 py-2.5", x.berry ? "bg-berry-tint" : "bg-ivory-deep/70")}>
                    <dt className="eyebrow">{x.label}</dt>
                    <dd className={cn("mt-1 text-2xl font-medium tabular", x.berry ? "text-berry" : "text-plum")}>{x.value}</dd>
                  </div>
                ))}
              </dl>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-plum-faint">{tr("stock.value")}</dt>
                <dd className="text-right tabular text-plum">{thb(c.stock.value)}</dd>
                <dt className="text-plum-faint">{tr("reports.avgCost")}</dt>
                <dd className="text-right tabular text-plum">{thb(c.stock.avgCost)}</dd>
                <dt className="text-plum-faint">{tr("products.lastPurchase")}</dt>
                <dd className="text-right text-plum">{c.lastPurchase ? formatDate(c.lastPurchase, locale) : "·"}</dd>
                <dt className="text-plum-faint">{tr("units.toBuyToday")}</dt>
                <dd className={cn("text-right tabular", c.toBuy > 0 ? "font-medium text-berry" : "text-plum")}>{c.toBuy}</dd>
              </dl>
            </Card>
          );
        })}
      </div>

      {admin ? (
        <Card className="mt-4">
          <CardHeader title={tr("inventory.adjust")} subtitle={tr("stock.adjustDesc")} />
          <form action={adjustStock} className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-5 sm:px-6 sm:pb-6">
            <input type="hidden" name="redirect_to" value="/stock" />
            <Field label={tr("common.product")} htmlFor="st-product">
              <Select id="st-product" name="product_id" defaultValue={filter.product ?? cards[0]?.stock.product.id ?? ""}>
                {cards.map((c) => (
                  <option key={c.stock.product.id} value={c.stock.product.id}>
                    {shortProductName(c.stock.product, locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr("inventory.qtyDelta")} htmlFor="st-qty" hint={tr("products.qtyDeltaHint")}>
              <Input id="st-qty" name="qty" type="number" inputMode="numeric" step={1} required className="tabular" />
            </Field>
            <Field label={tr("common.date")} htmlFor="st-date">
              <Input id="st-date" name="date" type="date" defaultValue={todayIso()} required />
            </Field>
            <div className="col-span-2">
              <Field label={tr("stock.reason")} htmlFor="st-note" hint={tr("stock.reasonHint")}>
                <Textarea id="st-note" name="note" required minLength={3} className="min-h-11" />
              </Field>
            </div>
            <div className="col-span-full">
              <Button type="submit" variant="secondary">
                {tr("inventory.adjustSave")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="mt-4 overflow-hidden">
        <CardHeader title={tr("stock.history")} subtitle={tr("stock.historyDesc")} />
        <form method="get" className="grid grid-cols-2 gap-2 px-5 pb-4 sm:grid-cols-[1fr_auto_auto_auto] sm:px-6">
          <Select name="product" defaultValue={filter.product ?? ""} aria-label={tr("common.product")}>
            <option value="">{tr("stock.allProducts")}</option>
            {cards.map((c) => (
              <option key={c.stock.product.id} value={c.stock.product.id}>
                {shortProductName(c.stock.product, locale)}
              </option>
            ))}
          </Select>
          <Input type="date" name="from" defaultValue={filter.from ?? ""} aria-label={tr("reports.from")} />
          <Input type="date" name="to" defaultValue={filter.to ?? ""} aria-label={tr("reports.to")} />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              {tr("reports.apply")}
            </Button>
            {exportQs ? (
              <ButtonLink href="/stock" variant="ghost">
                {tr("transactions.clearFilters")}
              </ButtonLink>
            ) : null}
          </div>
        </form>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {history.length === 0 ? (
            <p className="text-sm text-plum-soft">{tr("stock.historyEmpty")}</p>
          ) : (
            <>
              <ul className="space-y-2 lg:hidden">
                {history.slice(0, 200).map((m) => (
                  <li key={m.id} className="rounded-xl border border-line bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-plum">{shortProductName(m.product, locale)}</span>
                      <span className={cn("shrink-0 tabular text-base font-medium", m.qty > 0 ? "text-success" : "text-plum")}>
                        {m.qty > 0 ? "+" : ""}
                        {m.qty}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-plum-faint">
                      <span>{formatDate(m.date, locale)}</span>
                      <Pill tone={kindTone[m.kind]}>{kindName(m.kind)}</Pill>
                      {m.perUnit != null ? <span>· {thb(m.perUnit)}</span> : null}
                      {m.who ? <span>· {m.who}</span> : null}
                      {m.transaction_id ? (
                        <Link href={`/transactions/${m.transaction_id}/edit`} className="text-berry hover:underline">
                          · {tr("stock.openRow")} →
                        </Link>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
              <Table>
                <thead>
                  <tr>
                    <Th kind="date">{tr("common.date")}</Th>
                    <Th kind="long">{tr("common.product")}</Th>
                    <Th kind="pill">{tr("stock.kind")}</Th>
                    <Th kind="num">{tr("inventory.qty")}</Th>
                    <Th kind="money" priority="secondary">
                      {tr("stock.perUnit")}
                    </Th>
                    <Th kind="short" priority="secondary">
                      {tr("stock.recordedBy")}
                    </Th>
                    <Th kind="long" priority="tertiary">
                      {tr("common.note")}
                    </Th>
                    <Th kind="action" icons={2}>
                      <span className="sr-only">{tr("table.showDetail")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 500).map((m) => (
                    <ExpandableRow
                      key={m.id}
                      label={`${formatDate(m.date, locale)} ${productLine(m.product, locale)}`}
                      actions={
                        m.transaction_id ? (
                          <IconLink href={`/transactions/${m.transaction_id}/edit`} label={tr("stock.openRow")}>
                            <OpenIcon className="h-5 w-5" />
                          </IconLink>
                        ) : null
                      }
                      detail={
                        <RowDetail
                          items={[
                            { label: tr("table.fullName"), value: locale === "th" && m.product.name_th ? m.product.name_th : m.product.name, wide: true },
                            { label: tr("stock.perUnit"), value: m.perUnit != null ? <span className="tabular">{thb(m.perUnit)}</span> : null, priority: "secondary" },
                            { label: tr("stock.recordedBy"), value: m.who, priority: "secondary" },
                            { label: tr("common.note"), value: m.note, wide: true },
                          ]}
                        />
                      }
                    >
                      <Td kind="date">{formatDate(m.date, locale)}</Td>
                      <Td kind="long" className="text-plum" title={m.product.name}>
                        {productLine(m.product, locale)}
                      </Td>
                      <Td kind="pill">
                        <Pill tone={kindTone[m.kind]}>{kindName(m.kind)}</Pill>
                      </Td>
                      <Td kind="num" className={m.qty > 0 ? "text-success" : ""}>
                        {m.qty > 0 ? "+" : ""}
                        {m.qty}
                      </Td>
                      <Td kind="money" priority="secondary">
                        {m.perUnit != null ? thb(m.perUnit) : ""}
                      </Td>
                      <Td kind="short" priority="secondary" className="text-plum-soft">
                        {m.who ?? ""}
                      </Td>
                      <Td kind="long" priority="tertiary" className="text-plum-faint">
                        {m.note ?? ""}
                      </Td>
                    </ExpandableRow>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
