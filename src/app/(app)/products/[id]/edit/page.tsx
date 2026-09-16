import { notFound } from "next/navigation";
import { ProductForm } from "@/components/products/ProductForm";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { photoUrl } from "@/lib/inventory/photos";
import { UUID } from "@/lib/soft-delete";

export default async function EditProductPage({ params, searchParams }: PageProps<"/products/[id]/edit">) {
  const [{ id }, sp, session, locale] = await Promise.all([params, searchParams, requireAdmin("product", null, "/products?denied=1"), getLocale()]);
  const tr = t(locale);
  if (!UUID.test(id)) notFound();
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const product = snapshot.products.find((p) => p.id === id);
  if (!product) notFound();
  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow={tr("products.title")} title={tr("products.edit")} subtitle={tr("transactions.editSubtitle")} />
      <Card className="p-5 sm:p-6">
        <ProductForm tr={tr} product={product} photoUrl={product.photo_path ? photoUrl(product.photo_path) : null} error={typeof sp.error === "string" ? sp.error : null} />
      </Card>
    </div>
  );
}
