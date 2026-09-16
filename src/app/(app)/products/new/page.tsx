import { ProductForm } from "@/components/products/ProductForm";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";

export default async function NewProductPage({ searchParams }: PageProps<"/products/new">) {
  const [sp, , locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow={tr("products.title")} title={tr("products.add")} subtitle={tr("products.addSubtitle")} />
      <Card className="p-5 sm:p-6">
        <ProductForm tr={tr} error={typeof sp.error === "string" ? sp.error : null} />
      </Card>
    </div>
  );
}
