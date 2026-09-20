import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { StockPill } from "@/components/products/StockPill";
import { StackedItem, StackedList } from "@/components/ui/StackedList";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { OpenIcon } from "@/components/ui/Icons";
import { IconLink, RowDetail, Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { photoUrl } from "@/lib/inventory/photos";
import { valueStock } from "@/lib/inventory/valuation";
import { productName } from "@/lib/labels";
import { productLine } from "@/lib/search";
import { thb } from "@/lib/money";
import { cn } from "@/lib/cn";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const admin = session.profile.role === "admin";
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const stock = valueStock(snapshot.products, snapshot.movements).products.sort((a, b) => Number(b.product.active) - Number(a.product.active) || a.product.name.localeCompare(b.product.name));
  const total = stock.reduce((a, r) => a + r.value, 0);
  const toBuy = stock.filter((r) => r.backlog > 0);
  const displayName = (p: { name: string; name_th: string }) => (locale === "th" && p.name_th ? p.name_th : p.name);

  return (
    <div>
      <PageHeader title={tr("products.title")} subtitle={tr("products.subtitle")} action={<ButtonLink href="/products/new">{tr("products.add")}</ButtonLink>} />
      {sp.denied ? <p className="mb-4 rounded-xl bg-warning-tint px-4 py-3 text-sm text-warning-ink">{tr("roles.denied")}</p> : null}
      <p className="mb-4 text-sm text-plum-soft">
        {tr("products.stockTotal", { amount: thb(total) })} {!admin ? `· ${tr("products.viewOnly")}` : ""}
      </p>
      {toBuy.length ? (
        <div className="mb-4 rounded-card border border-berry/20 bg-berry-tint px-5 py-4">
          <p className="eyebrow">{tr("units.toBuyToday")}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {toBuy.map((r) => (
              <li key={r.product.id}>
                <Pill tone="berry">
                  {r.product.variant || r.product.name} · {tr("units.backlogUnits", { n: r.backlog })}
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stock.length === 0 ? (
        <EmptyState title={tr("products.empty")} body={tr("products.emptyBody")} action={<ButtonLink href="/products/new">{tr("products.add")}</ButtonLink>} />
      ) : (
        <>
          <StackedList>
            {stock.map((r) => (
              <StackedItem key={r.product.id} className={cn("p-0", !r.product.active && "opacity-60")}>
                <Link href={`/products/${r.product.id}`} className="flex items-center gap-3 px-4 py-3">
                  {r.product.photo_path ? <Image src={photoUrl(r.product.photo_path)} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lavender-tint font-display text-lg text-berry">{r.product.name.slice(0, 1)}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-plum">{productLine(r.product, locale)}</span>
                    <span className="block truncate text-xs text-plum-faint">
                      {r.product.variant || productName(tr, r.product.product_line)} · {thb(r.product.default_price)}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <StockPill row={r} tr={tr} />
                      {!r.product.active ? <Pill tone="neutral">{tr("settings.inactive")}</Pill> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular text-sm font-medium text-plum">{thb(r.value)}</span>
                    <span className="block text-xs text-plum-faint">{thb(r.avgCost)}</span>
                  </span>
                </Link>
              </StackedItem>
            ))}
          </StackedList>

          <Table>
            <thead>
              <tr>
                <Th kind="long">{tr("common.product")}</Th>
                <Th kind="status" align="right">
                  {tr("reports.onHand")}
                </Th>
                <Th kind="money" priority="secondary">
                  {tr("reports.avgCost")}
                </Th>
                <Th kind="money" priority="tertiary">
                  {tr("products.standardCost")}
                </Th>
                <Th kind="money" priority="secondary">
                  {tr("products.standardPrice")}
                </Th>
                <Th kind="money">{tr("reports.value")}</Th>
                <Th kind="action" icons={2}>
                  <span className="sr-only">{tr("products.detail")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {stock.map((r) => (
                <ExpandableRow
                  key={r.product.id}
                  className={cn(!r.product.active && "opacity-60")}
                  label={productLine(r.product, locale)}
                  actions={
                    <IconLink href={`/products/${r.product.id}`} label={tr("products.detail")}>
                      <OpenIcon className="h-5 w-5" />
                    </IconLink>
                  }
                  detail={
                    <RowDetail
                      items={[
                        { label: tr("table.fullName"), value: displayName(r.product), wide: true },
                        { label: tr("products.variant"), value: r.product.variant },
                        { label: tr("reports.avgCost"), value: <span className="tabular">{thb(r.avgCost)}</span>, priority: "secondary" },
                        { label: tr("products.standardPrice"), value: <span className="tabular">{thb(r.product.default_price)}</span>, priority: "secondary" },
                        { label: tr("products.standardCost"), value: <span className="tabular">{thb(r.product.default_cost)}</span>, priority: "tertiary" },
                      ]}
                    />
                  }
                >
                  <Td kind="long" className="font-medium text-plum" title={displayName(r.product)}>
                    <Link href={`/products/${r.product.id}`} className="hover:underline">
                      {productLine(r.product, locale)}
                    </Link>
                    {!r.product.active ? <Pill tone="neutral" className="ml-2">{tr("settings.inactive")}</Pill> : null}
                  </Td>
                  <Td kind="status" align="right">
                    <StockPill row={r} tr={tr} />
                  </Td>
                  <Td kind="money" priority="secondary">
                    {thb(r.avgCost)}
                  </Td>
                  <Td kind="money" priority="tertiary" className="text-plum-soft">
                    {thb(r.product.default_cost)}
                  </Td>
                  <Td kind="money" priority="secondary" className="text-plum-soft">
                    {thb(r.product.default_price)}
                  </Td>
                  <Td kind="money" className="font-medium">
                    {thb(r.value)}
                  </Td>
                </ExpandableRow>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
