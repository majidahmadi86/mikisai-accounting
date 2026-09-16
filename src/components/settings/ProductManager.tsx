import { addProductForm, adjustStock, updateProduct } from "@/app/(app)/settings/products-actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import type { Translator } from "@/lib/i18n/dictionary";
import type { ProductStock } from "@/lib/inventory/valuation";
import { productName } from "@/lib/labels";
import { thb, todayIso } from "@/lib/money";
import { PRODUCT_LINES } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Products with stock on hand, editable by the admin; anyone can add a product. */
export function ProductManager({ stock, tr, admin }: { stock: ProductStock[]; tr: Translator; admin: boolean }) {
  return (
    <Card className="p-5">
      <div id="products" className="scroll-mt-24">
        <p className="eyebrow">{tr("settings.products")}</p>
        <p className="mb-4 mt-1 text-sm text-plum-soft">{tr("settings.productsDesc")}</p>
      </div>
      <ul className="divide-y divide-line">
        {stock.map((row) => {
          const p = row.product;
          return (
            <li key={p.id} className={cn("py-3", !p.active && "opacity-60")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-plum">
                  {p.name} {p.variant ? <span className="text-plum-faint">· {p.variant}</span> : null}
                </p>
                <p className="flex items-center gap-2 text-xs">
                  <Pill tone={row.low ? "warning" : "success"}>
                    {row.onHand} {p.unit_label} · {thb(row.value)}
                  </Pill>
                  {!p.active ? <Pill tone="neutral">{tr("settings.inactive")}</Pill> : null}
                </p>
              </div>
              {admin ? (
                <form action={updateProduct.bind(null, p.id)} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="block">
                    <span className="eyebrow mb-1 block">{tr("inventory.name")}</span>
                    <Input name="name" defaultValue={p.name} required />
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">{tr("inventory.variant")}</span>
                    <Input name="variant" defaultValue={p.variant} />
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">{tr("common.product")}</span>
                    <Select name="product_line" defaultValue={p.product_line}>
                      {PRODUCT_LINES.map((l) => (
                        <option key={l} value={l}>
                          {productName(tr, l)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">{tr("inventory.unit")}</span>
                    <Input name="unit_label" defaultValue={p.unit_label} />
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">{tr("inventory.defaultCost")}</span>
                    <Input name="default_cost" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={p.default_cost} className="tabular" />
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">{tr("inventory.defaultPrice")}</span>
                    <Input name="default_price" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={p.default_price} className="tabular" />
                  </label>
                  <label className="block">
                    <span className="eyebrow mb-1 block">{tr("inventory.threshold")}</span>
                    <Input name="low_stock_threshold" type="number" inputMode="numeric" step="1" min="0" defaultValue={p.low_stock_threshold} className="tabular" />
                  </label>
                  <div className="flex items-end gap-2">
                    <label className="flex min-h-11 flex-1 items-center gap-2 text-sm text-plum">
                      <input type="checkbox" name="active" defaultChecked={p.active} className="h-5 w-5 accent-[#8f315f]" /> {tr("settings.active")}
                    </label>
                    <Button type="submit" variant="secondary" className="px-3">
                      {tr("common.save")}
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      <form action={addProductForm} className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 sm:grid-cols-4">
        <label className="block">
          <span className="eyebrow mb-1 block">{tr("inventory.name")}</span>
          <Input name="name" required placeholder={tr("inventory.newProduct")} />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">{tr("inventory.variant")}</span>
          <Input name="variant" placeholder="10 kg" />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">{tr("common.product")}</span>
          <Select name="product_line" defaultValue="sugar">
            {PRODUCT_LINES.map((l) => (
              <option key={l} value={l}>
                {productName(tr, l)}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            {tr("common.add")}
          </Button>
        </div>
      </form>

      {admin && stock.length ? (
        <form action={adjustStock} className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 sm:grid-cols-5">
          <p className="col-span-full eyebrow">{tr("inventory.adjust")}</p>
          <label className="block col-span-2">
            <span className="eyebrow mb-1 block">{tr("common.product")}</span>
            <Select name="product_id" defaultValue={stock[0].product.id}>
              {stock.map((r) => (
                <option key={r.product.id} value={r.product.id}>
                  {r.product.name}
                  {r.product.variant ? ` · ${r.product.variant}` : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{tr("inventory.qtyDelta")}</span>
            <Input name="qty" type="number" inputMode="decimal" step="1" required className="tabular" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{tr("inventory.unitCost")}</span>
            <Input name="unit_cost" type="number" inputMode="decimal" step="0.01" min="0" className="tabular" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{tr("common.date")}</span>
            <Input name="date" type="date" defaultValue={todayIso()} required />
          </label>
          <label className="block col-span-full sm:col-span-4">
            <span className="eyebrow mb-1 block">{tr("common.note")}</span>
            <Input name="note" placeholder={tr("inventory.adjustHint")} />
          </label>
          <div className="flex items-end">
            <Button type="submit" variant="secondary" className="w-full">
              {tr("inventory.adjustSave")}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
