import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { StackedItem, StackedList } from "@/components/ui/StackedList";
import { Table, Td, Th } from "@/components/ui/Table";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { photoUrl } from "@/lib/inventory/photos";
import { valueStock } from "@/lib/inventory/valuation";
import { productName } from "@/lib/labels";
import { thb } from "@/lib/money";
import { cn } from "@/lib/cn";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const admin = session.profile.role === "admin";
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const stock = valueStock(snapshot.products, snapshot.movements).products.sort((a, b) => Number(b.product.active) - Number(a.product.active) || a.product.name.localeCompare(b.product.name));
  const total = stock.reduce((a, r) => a + r.value, 0);
  const displayName = (p: { name: string; name_th: string }) => (locale === "th" && p.name_th ? p.name_th : p.name);

  return (
    <div>
      <PageHeader title={tr("products.title")} subtitle={tr("products.subtitle")} action={<ButtonLink href="/products/new">{tr("products.add")}</ButtonLink>} />
      {sp.denied ? <p className="mb-4 rounded-xl bg-warning-tint px-4 py-3 text-sm text-warning-ink">{tr("roles.denied")}</p> : null}
      <p className="mb-4 text-sm text-plum-soft">
        {tr("products.stockTotal", { amount: thb(total) })} {!admin ? `· ${tr("products.viewOnly")}` : ""}
      </p>

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
                    <span className="block truncate text-sm font-medium text-plum">{displayName(r.product)}</span>
                    <span className="block truncate text-xs text-plum-faint">
                      {r.product.variant || productName(tr, r.product.product_line)} · {thb(r.product.default_price)}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <Pill tone={r.low ? "warning" : "success"}>
                        {r.onHand} {tr(`products.unit.${r.product.unit_label as "box"}`)}
                      </Pill>
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
                <Th>{tr("common.product")}</Th>
                <Th>{tr("products.variant")}</Th>
                <Th align="right">{tr("reports.onHand")}</Th>
                <Th align="right">{tr("reports.avgCost")}</Th>
                <Th align="right">{tr("products.standardCost")}</Th>
                <Th align="right">{tr("products.standardPrice")}</Th>
                <Th align="right">{tr("reports.value")}</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {stock.map((r) => (
                <tr key={r.product.id} className={cn("hover:bg-lavender-tint", !r.product.active && "opacity-60")}>
                  <Td className="font-medium text-plum">
                    <Link href={`/products/${r.product.id}`} className="hover:underline">
                      {displayName(r.product)}
                    </Link>
                    {!r.product.active ? <Pill tone="neutral" className="ml-2">{tr("settings.inactive")}</Pill> : null}
                  </Td>
                  <Td className="text-plum-soft">{r.product.variant}</Td>
                  <Td align="right">
                    <Pill tone={r.low ? "warning" : "success"}>
                      {r.onHand} {tr(`products.unit.${r.product.unit_label as "box"}`)}
                    </Pill>
                  </Td>
                  <Td align="right">{thb(r.avgCost)}</Td>
                  <Td align="right" className="text-plum-soft">
                    {thb(r.product.default_cost)}
                  </Td>
                  <Td align="right" className="text-plum-soft">
                    {thb(r.product.default_price)}
                  </Td>
                  <Td align="right" className="font-medium">
                    {thb(r.value)}
                  </Td>
                  <Td align="right">
                    <Link href={`/products/${r.product.id}`} className="text-xs text-berry hover:underline whitespace-nowrap">
                      {tr("products.detail")} →
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
