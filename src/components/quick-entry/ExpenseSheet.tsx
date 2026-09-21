"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createProduct } from "@/app/(app)/settings/products-actions";
import { ProductPicker } from "@/components/products/ProductPicker";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { categoryLabel } from "@/lib/categories";
import { useLocale, useT } from "@/lib/i18n/client";
import { coversBacklog } from "@/lib/inventory/backlog";
import { shortProductName } from "@/lib/inventory/units";
import { productName } from "@/lib/labels";
import type { TransactionInput } from "@/lib/ledger/transaction-input";
import { round2, todayIso } from "@/lib/money";
import { PEOPLE, PRODUCT_LINES, type Person, type ProductLine } from "@/lib/types";
import { useQuickEntry } from "./QuickEntryProvider";

const STORAGE_KEY = "mikisai.quick-entry.v2";
const NEW = "__new__";
const MORE = "__more__";
const EFFECT_ORDER = { purchase: 0, sample: 1, none: 2 } as const;

type Remembered = { category?: string; productId?: string };

function readRemembered(): Remembered {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Remembered) : {};
  } catch {
    return {};
  }
}

function remember(patch: Remembered) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readRemembered(), ...patch }));
  } catch {
    // Private mode or storage disabled: defaults still come from the server.
  }
}

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s฿]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

/**
 * Expense: what was paid, for what, by whom. Stock purchase and Samples are
 * the first two choices; picking one asks for the product, the units and the
 * cost per unit, and the amount follows. `stockFirst` opens on Stock purchase
 * (Home's "Record what you paid for today").
 */
export function ExpenseSheet({ retryInput, stockFirst = false }: { retryInput: TransactionInput | null; stockFirst?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const { data, submit } = useQuickEntry();
  const remembered = useMemo(() => readRemembered(), []);
  const retry = retryInput?.type === "expense" ? retryInput : null;
  const retryItem = retry?.items?.[0];
  const products = useMemo(() => data.products.filter((p) => p.active), [data.products]);
  const categories = useMemo(() => [...data.categories].sort((a, b) => EFFECT_ORDER[a.stock_effect] - EFFECT_ORDER[b.stock_effect]), [data.categories]);

  const [category, setCategory] = useState<string>(() => {
    const wanted = retry?.category_id ?? (stockFirst ? undefined : remembered.category);
    return wanted && categories.some((c) => c.id === wanted) ? wanted : (categories[0]?.id ?? "");
  });
  const [amountText, setAmountText] = useState(() => (retry ? String(retry.amount) : ""));
  const [amountTouched, setAmountTouched] = useState(Boolean(retry));
  const [productId, setProductId] = useState<string>(() => {
    const wanted = retryItem?.product_id ?? remembered.productId ?? data.lastProductId;
    return wanted && products.some((p) => p.id === wanted) ? wanted : (products[0]?.id ?? NEW);
  });
  const [showPicker, setShowPicker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVariant, setNewVariant] = useState("");
  const [newLine, setNewLine] = useState<ProductLine>("sugar");
  const [quantity, setQuantity] = useState<number>(retryItem?.qty ?? retry?.quantity ?? 1);
  const [unitCostText, setUnitCostText] = useState(() => (retryItem?.unit_cost != null ? String(retryItem.unit_cost) : ""));
  const [costTouched, setCostTouched] = useState(retryItem?.unit_cost != null);
  const [person, setPerson] = useState<Person>(retry?.payer ?? data.person);
  const [date, setDate] = useState(retry?.date ?? todayIso());
  const [note, setNote] = useState(retry?.note ?? "");
  const [showNote, setShowNote] = useState(Boolean(retry?.note));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => amountRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const stockEffect = categories.find((c) => c.id === category)?.stock_effect ?? "none";
  const needsItems = stockEffect !== "none";
  // Standard cost prefills a purchase until the user types one; the amount follows qty x cost until the user types an amount.
  const shownCost = !costTouched && selectedProduct && selectedProduct.default_cost > 0 && needsItems ? String(selectedProduct.default_cost) : unitCostText;
  const unitCost = parseAmount(shownCost);
  const shownAmount = needsItems && !amountTouched && unitCost != null ? String(round2(unitCost * quantity)) : amountText;
  const amount = parseAmount(shownAmount);
  const productLine: ProductLine = selectedProduct?.product_line ?? (productId === NEW ? newLine : data.lastProduct);

  const chipProducts = [...products].sort((a, b) => (a.id === data.lastProductId ? -1 : b.id === data.lastProductId ? 1 : 0)).slice(0, 8);
  const inChips = chipProducts.some((p) => p.id === productId);
  const backlogElsewhere = (() => {
    if (stockEffect !== "purchase" || !selectedProduct || (data.backlog[selectedProduct.id] ?? 0) > 0) return null;
    const hit = Object.entries(data.backlog).find(([pid, n]) => n > 0 && pid !== selectedProduct.id && products.find((p) => p.id === pid)?.product_line === selectedProduct.product_line);
    if (!hit) return null;
    return { a: shortProductName(products.find((p) => p.id === hit[0])!, locale), n: hit[1], b: shortProductName(selectedProduct, locale) };
  })();

  async function resolveProductId(): Promise<string | null> {
    if (productId !== NEW) return productId;
    if (!newName.trim()) {
      setError(t("inventory.nameRequired"));
      return null;
    }
    const result = await createProduct({ name: newName.trim(), variant: newVariant.trim(), product_line: newLine, unit_label: "box", stock_mode: "buy_to_order", default_price: 0, default_cost: unitCost ?? 0 });
    if (!result.ok) {
      setError(t("common.error"));
      return null;
    }
    return result.id;
  }

  async function save(keepOpen: boolean) {
    if (amount == null || amount <= 0) {
      setError(t("quick.amountRequired"));
      amountRef.current?.focus();
      return;
    }
    if (stockEffect === "purchase" && (unitCost == null || unitCost <= 0)) return setError(t("inventory.unitCostRequired"));
    setError(null);
    setBusy(true);
    const pid = needsItems ? await resolveProductId() : null;
    setBusy(false);
    if (needsItems && !pid) return;

    const items = needsItems && pid ? [{ product_id: pid, qty: quantity, unit_cost: unitCost ?? undefined }] : undefined;
    const input: TransactionInput = { type: "expense", date, platform: "other", product_line: productLine, amount, quantity: needsItems ? quantity : 1, payer: person, category_id: category, note: note.trim() || undefined, items };
    remember({ category, productId: pid ?? undefined });
    // A stock purchase against a backlog says how much of it this delivery clears.
    const cover = stockEffect === "purchase" && pid ? coversBacklog(data.backlog[pid] ?? 0, quantity) : null;
    submit(input, keepOpen, cover && cover.of > 0 ? t("inventory.coversBacklog", { n: cover.covers, m: cover.of }) : undefined);
    if (keepOpen) {
      setAmountText("");
      setAmountTouched(false);
      setNote("");
      setQuantity(1);
      window.setTimeout(() => amountRef.current?.focus(), 30);
    }
  }

  return (
    <>
      <form
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <div className="mt-2">
          <Field label={t("expense.what")}>
            <Chips label={t("expense.what")} options={categories.map((c) => ({ value: c.id, label: categoryLabel(c, locale) }))} value={category} onChange={setCategory} />
          </Field>
        </div>

        {needsItems ? (
          <div className="mt-4">
            <Field label={t("inventory.product")}>
              <Chips
                label={t("inventory.product")}
                options={[...chipProducts.map((p) => ({ value: p.id, label: shortProductName(p, locale) })), { value: MORE, label: t("inventory.moreProducts") }]}
                value={inChips ? productId : MORE}
                onChange={(v) => {
                  if (v === MORE) setShowPicker(true);
                  else {
                    setProductId(v);
                    setShowPicker(false);
                  }
                }}
              />
            </Field>
            {showPicker || !inChips ? (
              <div className="mt-2">
                <ProductPicker
                  id="qe-product"
                  products={products}
                  value={productId === NEW ? "" : productId}
                  onChange={(id) => setProductId(id)}
                  label={t("inventory.moreProducts")}
                  createLabel={stockEffect === "sample" ? t("inventory.newSampleProduct") : t("inventory.newProduct")}
                  onCreate={() => {
                    setProductId(NEW);
                    if (stockEffect === "sample" && !newName) setNewName("Sample ");
                  }}
                />
              </div>
            ) : null}
            {productId === NEW ? (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-lavender-tint p-3">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("inventory.name")} aria-label={t("inventory.name")} />
                <Input value={newVariant} onChange={(e) => setNewVariant(e.target.value)} placeholder={t("inventory.variant")} aria-label={t("inventory.variant")} />
                <div className="col-span-2">
                  <Chips label={t("common.product")} options={PRODUCT_LINES.map((p) => ({ value: p, label: productName(t, p) }))} value={newLine} onChange={setNewLine} />
                </div>
              </div>
            ) : null}
            {backlogElsewhere ? <p className="mt-2 rounded-xl bg-warning-tint px-3 py-2 text-sm text-warning-ink">{t("inventory.crossBacklog", backlogElsewhere)}</p> : null}
          </div>
        ) : null}

        {needsItems ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label={t("quick.quantity")} htmlFor="qe-qty">
              <div className="flex min-h-14 items-stretch overflow-hidden rounded-2xl border border-line bg-card">
                <button type="button" aria-label="-1" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-12 text-2xl text-plum-soft hover:bg-lavender-tint active:bg-lavender-soft">
                  −
                </button>
                <input id="qe-qty" type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(100000, Math.floor(Number(e.target.value) || 1))))} className="w-full min-w-0 border-x border-line bg-card text-center font-display text-2xl tabular focus:outline-none" />
                <button type="button" aria-label="+1" onClick={() => setQuantity((q) => Math.min(100000, q + 1))} className="w-12 text-2xl text-plum-soft hover:bg-lavender-tint active:bg-lavender-soft">
                  +
                </button>
              </div>
            </Field>
            <Field label={t("inventory.unitCost")} htmlFor="qe-cost">
              <Input
                id="qe-cost"
                inputMode="decimal"
                value={shownCost}
                onChange={(e) => {
                  setUnitCostText(e.target.value);
                  setCostTouched(true);
                }}
                placeholder="0.00"
                className="min-h-14 tabular"
              />
            </Field>
          </div>
        ) : null}

        <div className="mt-4">
          <Field label={t("quick.amountExpense")} htmlFor="qe-amount" hint={t("quick.amountExpenseHint")}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-display text-2xl text-plum-faint">฿</span>
              <input
                ref={amountRef}
                id="qe-amount"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                pattern="[0-9]*[.,]?[0-9]*"
                value={shownAmount}
                onChange={(e) => {
                  setAmountText(e.target.value);
                  setAmountTouched(true);
                }}
                placeholder="0.00"
                className="w-full min-h-16 rounded-2xl border border-line bg-card pl-11 pr-4 font-display text-3xl tabular text-plum placeholder:text-plum-faint focus:border-berry focus:outline-none focus:ring-2 focus:ring-lavender"
              />
            </div>
          </Field>
          {error ? <p className="mt-2 rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{error}</p> : null}
        </div>

        <div className="mt-4">
          <Field label={t("quick.paidBy")}>
            <Chips label={t("quick.paidBy")} options={PEOPLE.map((p) => ({ value: p, label: t(`common.${p}`) }))} value={person} onChange={setPerson} />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label={t("quick.date")} htmlFor="qe-date">
            <Input id="qe-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>

        <div className="mt-4">
          {showNote ? (
            <Field label={t("quick.note")} htmlFor="qe-note">
              <Textarea id="qe-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" />
            </Field>
          ) : (
            <button type="button" onClick={() => setShowNote(true)} className="min-h-11 text-sm font-medium text-berry hover:underline">
              + {t("quick.addNote")}
            </button>
          )}
        </div>
      </form>

      <div className="border-t border-line bg-ivory px-5 pt-3 pb-4 pb-safe">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button type="button" disabled={busy} onClick={() => void save(false)} className="min-h-12 text-base">
            {t("quick.save")}
          </Button>
          <Button type="button" disabled={busy} variant="secondary" onClick={() => void save(true)} className="min-h-12">
            {t("quick.saveAnother")}
          </Button>
        </div>
      </div>
    </>
  );
}
