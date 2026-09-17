import Image from "next/image";
import { saveProductForm } from "@/app/(app)/settings/products-actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { Translator } from "@/lib/i18n/dictionary";
import { UNIT_LABELS, type ListPrices } from "@/lib/inventory/product-stats";
import { STOCK_MODES, type Product } from "@/lib/inventory/valuation";
import { productName } from "@/lib/labels";
import { PLATFORMS, PRODUCT_LINES } from "@/lib/types";

/** Create and edit share this form. Fields carry hints in both languages. */
export function ProductForm({ tr, product, photoUrl, error }: { tr: Translator; product?: Product | null; photoUrl?: string | null; error?: string | null }) {
  const list = (product?.list_prices ?? {}) as ListPrices;
  const action = saveProductForm.bind(null, product?.id ?? null);
  return (
    <form action={action} className="space-y-5" encType="multipart/form-data">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("products.nameEn")} htmlFor="p-name" hint={tr("products.nameHint")}>
          <Input id="p-name" name="name" required maxLength={120} defaultValue={product?.name ?? ""} />
        </Field>
        <Field label={tr("products.shortName")} htmlFor="p-short" hint={tr("products.shortNameHint")}>
          <Input id="p-short" name="short_name" maxLength={40} defaultValue={product?.short_name ?? ""} placeholder="1 kg packs" />
        </Field>
        <Field label={tr("products.nameTh")} htmlFor="p-name-th" hint={tr("products.nameThHint")}>
          <Input id="p-name-th" name="name_th" maxLength={120} defaultValue={product?.name_th ?? ""} />
        </Field>
        <Field label={tr("common.product")} htmlFor="p-line" hint={tr("products.lineHint")}>
          <Select id="p-line" name="product_line" defaultValue={product?.product_line ?? "sugar"}>
            {PRODUCT_LINES.map((l) => (
              <option key={l} value={l}>
                {productName(tr, l)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("products.variant")} htmlFor="p-variant" hint={tr("products.variantHint")}>
          <Input id="p-variant" name="variant" maxLength={120} defaultValue={product?.variant ?? ""} placeholder="1 kg x 10 packs" />
        </Field>
        <Field label={tr("products.unit")} htmlFor="p-unit" hint={tr("products.unitHint")}>
          <Select id="p-unit" name="unit_label" defaultValue={product?.unit_label ?? "box"}>
            {UNIT_LABELS.map((u) => (
              <option key={u} value={u}>
                {tr(`products.unit.${u}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("products.stockMode")} htmlFor="p-mode" hint={tr("products.stockModeHint")}>
          <Select id="p-mode" name="stock_mode" defaultValue={product?.stock_mode ?? "buy_to_order"}>
            {STOCK_MODES.map((m) => (
              <option key={m} value={m}>
                {tr(`products.stockMode.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("products.threshold")} htmlFor="p-threshold" hint={tr("products.thresholdHint")}>
          <Input id="p-threshold" name="low_stock_threshold" type="number" inputMode="numeric" min={0} step={1} defaultValue={product?.low_stock_threshold ?? 3} className="tabular" />
        </Field>
        <Field label={tr("products.standardCost")} htmlFor="p-cost" hint={tr("products.standardCostHint")}>
          <Input id="p-cost" name="default_cost" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={product?.default_cost ?? 0} className="tabular text-lg" />
        </Field>
        <Field label={tr("products.standardPrice")} htmlFor="p-price" hint={tr("products.standardPriceHint")}>
          <Input id="p-price" name="default_price" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={product?.default_price ?? 0} className="tabular text-lg" />
        </Field>
      </div>

      <div>
        <p className="eyebrow mb-1.5">{tr("products.listPrices")}</p>
        <p className="mb-2 text-xs text-plum-soft">{tr("products.listPricesHint")}</p>
        <div className="grid grid-cols-3 gap-3">
          {PLATFORMS.filter((p) => p !== "other").map((p) => (
            <label key={p} className="block">
              <span className="eyebrow mb-1 block">{tr(`platform.${p}`)}</span>
              <Input name={`list_${p}`} type="number" inputMode="decimal" min={0} step="0.01" defaultValue={list[p as keyof ListPrices] ?? ""} placeholder={tr("common.optional")} className="tabular" />
            </label>
          ))}
        </div>
      </div>

      <Field label={tr("products.photo")} htmlFor="p-photo" hint={tr("products.photoHint")}>
        {photoUrl ? (
          <div className="mb-2 flex items-center gap-3">
            <Image src={photoUrl} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded-xl object-cover" />
            <label className="flex items-center gap-2 text-sm text-plum">
              <input type="checkbox" name="remove_photo" className="h-5 w-5 accent-[#8f315f]" /> {tr("products.removePhoto")}
            </label>
          </div>
        ) : null}
        <Input id="p-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="py-2" />
      </Field>

      <Field label={tr("products.notes")} htmlFor="p-notes" hint={tr("products.notesHint")}>
        <Textarea id="p-notes" name="notes" maxLength={2000} defaultValue={product?.notes ?? ""} />
      </Field>

      {product ? (
        <label className="flex min-h-11 items-center gap-2 text-sm text-plum">
          <input type="checkbox" name="active" defaultChecked={product.active} className="h-5 w-5 accent-[#8f315f]" /> {tr("settings.active")}
          <span className="text-xs text-plum-soft">· {tr("products.activeHint")}</span>
        </label>
      ) : null}

      {error ? <p className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{error === "denied" ? tr("roles.denied") : tr("common.error")}</p> : null}
      <div className="sticky bottom-20 z-10 -mx-5 flex gap-2 border-t border-line bg-ivory/95 px-5 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" className="flex-1 md:flex-none">
          {tr("common.save")}
        </Button>
        <ButtonLink href={product ? `/products/${product.id}` : "/products"} variant="ghost">
          {tr("common.cancel")}
        </ButtonLink>
      </div>
    </form>
  );
}
