"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createProduct } from "@/app/(app)/settings/products-actions";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { CameraIcon, CloseIcon } from "@/components/ui/Icons";
import { useLocale, useT } from "@/lib/i18n/client";
import { categoryLabel } from "@/lib/categories";
import { shortProductName } from "@/lib/inventory/units";
import { ProductPicker } from "@/components/products/ProductPicker";
import { salePriceFor } from "@/lib/inventory/product-stats";
import { coversBacklog } from "@/lib/inventory/backlog";
import { unitSanity } from "@/lib/inventory/quantity";
import { platformName, productName } from "@/lib/labels";
import type { TransactionInput } from "@/lib/ledger/transaction-input";
import { round2, thb, todayIso } from "@/lib/money";
import { estimateNet } from "@/lib/parse/estimate";
import { PEOPLE, PLATFORMS, PRODUCT_LINES, type Person, type Platform, type ProductLine, type TransactionType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useQuickEntry } from "./QuickEntryProvider";
import { TransferSheet } from "./TransferSheet";
import { QuickOrderSheet } from "./QuickOrderSheet";

const STORAGE_KEY = "mikisai.quick-entry.v2";

type Remembered = { platform?: Platform; product?: ProductLine; category?: string; productId?: string };

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

const NEW = "__new__";
const MORE = "__more__";

export function QuickEntrySheet({ initialType, retryInput }: { initialType: TransactionType | "transfer" | "order"; retryInput: TransactionInput | null }) {
  const t = useT();
  const locale = useLocale();
  const { close, data, submit, notify } = useQuickEntry();
  const transferMode = initialType === "transfer";
  const [orderMode, setOrderMode] = useState(initialType === "order");
  const remembered = useMemo(() => readRemembered(), []);
  const products = useMemo(() => data.products.filter((p) => p.active), [data.products]);

  const retryItem = retryInput?.items?.[0];
  const [type, setType] = useState<TransactionType>(retryInput?.type ?? (initialType === "transfer" || initialType === "order" ? "income" : initialType));
  const [amountText, setAmountText] = useState(() => (retryInput ? String(retryInput.type === "income" ? retryInput.gross_amount : retryInput.amount) : ""));
  const [amountTouched, setAmountTouched] = useState(Boolean(retryInput));
  const [netText, setNetText] = useState(() => (retryInput?.type === "income" && retryInput.net_amount != null ? String(retryInput.net_amount) : ""));
  const [editNet, setEditNet] = useState(() => retryInput?.type === "income" && retryInput.net_amount != null);
  const [date, setDate] = useState(retryInput?.date ?? todayIso());
  const [platform, setPlatform] = useState<Platform>(retryInput?.platform ?? remembered.platform ?? data.lastPlatform);
  const [productId, setProductId] = useState<string>(() => {
    const wanted = retryItem?.product_id ?? remembered.productId ?? data.lastProductId;
    return wanted && products.some((p) => p.id === wanted) ? wanted : products[0]?.id ?? NEW;
  });
  const [newName, setNewName] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [newVariant, setNewVariant] = useState("");
  const [newLine, setNewLine] = useState<ProductLine>("sugar");
  const [quantity, setQuantity] = useState<number>(retryItem?.qty ?? retryInput?.quantity ?? 1);
  const [unitCostText, setUnitCostText] = useState(() => (retryItem?.unit_cost != null ? String(retryItem.unit_cost) : ""));
  const [costTouched, setCostTouched] = useState(Boolean(retryItem?.unit_cost != null));
  const [person, setPerson] = useState<Person>(retryInput ? (retryInput.type === "income" ? retryInput.received_by : retryInput.payer) : data.person);
  const [category, setCategory] = useState<string>(() => {
    const wanted = retryInput?.type === "expense" ? retryInput.category_id : remembered.category;
    return wanted && data.categories.some((c) => c.id === wanted) ? wanted : data.categories[0]?.id ?? "";
  });
  const [customer, setCustomer] = useState(retryInput?.type === "income" ? (retryInput.customer_name ?? "") : "");
  const [note, setNote] = useState(retryInput?.note ?? "");
  const [showNote, setShowNote] = useState(Boolean(retryInput?.note));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => amountRef.current?.focus(), 60);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  const isIncome = type === "income";
  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const productLine: ProductLine = selectedProduct?.product_line ?? (productId === NEW ? newLine : remembered.product ?? data.lastProduct);
  const categoryRow = data.categories.find((c) => c.id === category);
  const stockEffect = !isIncome ? (categoryRow?.stock_effect ?? "none") : "none";
  const needsItems = isIncome || stockEffect !== "none";
  // Standard cost prefills a purchase until the user types one.
  const shownCost = !costTouched && selectedProduct && selectedProduct.default_cost > 0 && stockEffect !== "none" ? String(selectedProduct.default_cost) : unitCostText;
  const unitCost = parseAmount(shownCost);

  // Expense with a stock effect: the amount follows qty x unit cost until the user types an amount.
  // A sale prefills the amount from the platform list price (else the standard price) times units, until the user types.
  const listPrice = isIncome && selectedProduct ? salePriceFor(selectedProduct, platform) : 0;
  const derivedAmount =
    !isIncome && stockEffect !== "none" && !amountTouched && unitCost != null
      ? String(round2(unitCost * quantity))
      : isIncome && !amountTouched && listPrice > 0
        ? String(round2(listPrice * quantity))
        : null;
  const shownAmount = derivedAmount ?? amountText;
  const amount = parseAmount(shownAmount);
  const estimate = amount != null ? estimateNet(amount, platform, data.settings) : null;
  const netOverride = editNet ? parseAmount(netText) : null;
  // Does the amount fit the unit count? Warns, never blocks.
  const sanity = isIncome && selectedProduct ? unitSanity(netOverride ?? estimate ?? 0, quantity, selectedProduct.default_price) : null;

  const customerNames = useMemo(() => {
    const seen = new Set<string>();
    return data.customers.map((c) => c.name).filter((n) => (seen.has(n.toLowerCase()) ? false : (seen.add(n.toLowerCase()), true)));
  }, [data.customers]);

  async function resolveProductId(): Promise<string | null> {
    if (productId !== NEW) return productId;
    if (!newName.trim()) {
      setError(t("inventory.nameRequired"));
      return null;
    }
    const result = await createProduct({ name: newName.trim(), variant: newVariant.trim(), product_line: newLine, unit_label: "box", stock_mode: "buy_to_order", default_price: isIncome && amount && quantity ? round2(amount / quantity) : 0, default_cost: !isIncome && unitCost ? unitCost : 0 });
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
    if (needsItems && stockEffect === "purchase" && (unitCost == null || unitCost <= 0)) {
      setError(t("inventory.unitCostRequired"));
      return;
    }
    setError(null);
    setBusy(true);
    const pid = needsItems ? await resolveProductId() : null;
    setBusy(false);
    if (needsItems && !pid) return;

    const items = needsItems && pid ? [{ product_id: pid, qty: quantity, unit_price: isIncome ? round2(amount / quantity) : undefined, unit_cost: !isIncome ? (unitCost ?? undefined) : undefined }] : undefined;
    const input: TransactionInput = isIncome
      ? { type: "income", date, platform, product_line: productLine, gross_amount: amount, net_amount: netOverride ?? estimate ?? amount, quantity, received_by: person, customer_name: customer.trim() || undefined, note: note.trim() || undefined, items: items! }
      : { type: "expense", date, platform, product_line: productLine, amount, quantity, payer: person, category_id: category, note: note.trim() || undefined, items };

    remember({ platform, product: productLine, category, productId: pid ?? undefined });
    // A stock purchase against a backlog says how much of it this delivery clears.
    const cover = stockEffect === "purchase" && pid ? coversBacklog(data.backlog[pid] ?? 0, quantity) : null;
    submit(input, keepOpen, cover && cover.of > 0 ? t("inventory.coversBacklog", { n: cover.covers, m: cover.of }) : undefined);
    if (keepOpen) {
      setAmountText("");
      setAmountTouched(false);
      setNetText("");
      setEditNet(false);
      setCustomer("");
      setNote("");
      setQuantity(1);
      window.setTimeout(() => amountRef.current?.focus(), 30);
    }
  }

  const chipProducts = [...products].sort((a, b) => (a.id === data.lastProductId ? -1 : b.id === data.lastProductId ? 1 : 0)).slice(0, 8);
  const inChips = chipProducts.some((p) => p.id === productId);
  const backlogElsewhere = (() => {
    if (stockEffect !== "purchase" || !selectedProduct || (data.backlog[selectedProduct.id] ?? 0) > 0) return null;
    const hit = Object.entries(data.backlog).find(([pid, n]) => n > 0 && pid !== selectedProduct.id && products.find((p) => p.id === pid)?.product_line === selectedProduct.product_line);
    if (!hit) return null;
    const other = products.find((p) => p.id === hit[0])!;
    return { a: shortProductName(other, locale), n: hit[1], b: shortProductName(selectedProduct, locale) };
  })();

  const productPicker = (
    <div className="mt-4">
      <Field label={t("inventory.product")} hint={t("inventory.productHint")}>
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
  );

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="quick-entry-title">
      <button type="button" aria-label={t("quick.close")} onClick={close} className="absolute inset-0 bg-plum/45 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-ivory shadow-[0_-10px_40px_rgba(48,35,51,0.25)] md:max-h-[90vh] md:max-w-lg md:rounded-[24px]">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            <p className="eyebrow">{transferMode ? t("transfer.eyebrow") : t("nav.add")}</p>
            <h2 id="quick-entry-title" className="text-2xl text-plum">
              {transferMode ? t("transfer.title") : orderMode ? t("quick.orderTitle") : t("quick.title")}
            </h2>
            <p className="text-xs text-plum-soft">{transferMode ? t("transfer.sheetSubtitle") : orderMode ? t("quick.orderSubtitle") : t("quick.subtitle")}</p>
          </div>
          <button type="button" onClick={close} aria-label={t("quick.close")} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint hover:text-plum">
            <CloseIcon />
          </button>
        </div>

        {transferMode ? (
          <TransferSheet
            defaultFrom={data.person}
            onSaved={(message) => {
              close();
              notify({ message });
            }}
            onError={(message) => notify({ message })}
          />
        ) : null}
        {!transferMode ? (
          <div className="grid grid-cols-3 gap-2 px-5 pb-2" role="radiogroup" aria-label={t("common.type")}>
            {(["income", "expense", "order"] as const).map((v) => {
              const active = v === "order" ? orderMode : !orderMode && type === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    if (v === "order") setOrderMode(true);
                    else {
                      setOrderMode(false);
                      setType(v);
                    }
                  }}
                  className={cn("min-h-14 rounded-2xl border text-base font-medium transition-colors", active ? "border-berry bg-berry text-ivory shadow-[0_2px_10px_rgba(143,49,95,0.3)]" : "border-line bg-card text-plum hover:bg-lavender-tint")}
                >
                  {v === "income" ? t("quick.income") : v === "expense" ? t("quick.expense") : t("quick.order")}
                </button>
              );
            })}
          </div>
        ) : null}
        {orderMode && !transferMode ? (
          <QuickOrderSheet
            onSaved={(message) => {
              close();
              notify({ message });
            }}
            onError={(message) => notify({ message })}
          />
        ) : null}
        <form
          className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-4", (transferMode || orderMode) && "hidden")}
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >

          <div className="mt-4">
            <Field label={isIncome ? t("quick.amountIncome") : t("quick.amountExpense")} htmlFor="qe-amount" hint={isIncome ? t("quick.amountIncomeHint") : t("quick.amountExpenseHint")}>
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
            {isIncome ? (
              <div className="mt-2">
                {editNet ? (
                  <Field label={t("quick.netLabel")} htmlFor="qe-net" hint={t("quick.netHint")}>
                    <div className="flex gap-2">
                      <Input id="qe-net" inputMode="decimal" value={netText} onChange={(e) => setNetText(e.target.value)} placeholder={estimate != null ? String(estimate) : ""} className="tabular" />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEditNet(false);
                          setNetText("");
                        }}
                      >
                        {t("quick.useEstimate")}
                      </Button>
                    </div>
                  </Field>
                ) : (
                  <button type="button" onClick={() => setEditNet(true)} className="w-full rounded-xl bg-lavender-tint px-4 py-2.5 text-left transition-colors hover:bg-lavender-soft">
                    <span className="block text-sm font-medium text-berry">{t("quick.youReceive", { amount: thb(estimate ?? 0) })}</span>
                    <span className="block text-xs text-plum-soft">{t("quick.youReceiveHint")}</span>
                  </button>
                )}
              </div>
            ) : null}
            {error ? <p className="mt-2 rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{error}</p> : null}
          </div>

          {isIncome ? null : (
            <div className="mt-4">
              <Field label={t("quick.category")} hint={t("quick.categoryHint")}>
                <Chips label={t("quick.category")} options={data.categories.map((c) => ({ value: c.id, label: categoryLabel(c, locale) }))} value={category} onChange={setCategory} />
              </Field>
            </div>
          )}

          {needsItems ? productPicker : null}

          {needsItems ? (
            <div className="mt-4">
              <Field label={t("quick.quantity")} htmlFor="qe-qty" hint={isIncome ? t("quick.quantityHint") : t("inventory.qtyHintPurchase")}>
                <div className="flex min-h-14 items-stretch overflow-hidden rounded-2xl border border-line bg-card">
                  <button type="button" aria-label="-1" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-16 text-2xl text-plum-soft hover:bg-lavender-tint active:bg-lavender-soft">
                    −
                  </button>
                  <input id="qe-qty" type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(100000, Math.floor(Number(e.target.value) || 1))))} className="w-full border-x border-line bg-card text-center font-display text-2xl tabular focus:outline-none" />
                  <button type="button" aria-label="+1" onClick={() => setQuantity((q) => Math.min(100000, q + 1))} className="w-16 text-2xl text-plum-soft hover:bg-lavender-tint active:bg-lavender-soft">
                    +
                  </button>
                </div>
              </Field>
              {sanity ? <p className="mt-2 rounded-xl bg-warning-tint px-3 py-2 text-sm text-warning-ink">{t("quick.qtyWarning", { n: sanity.looksLike, m: sanity.entered })}</p> : null}
            </div>
          ) : null}

          {needsItems ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {isIncome ? (
                <Field label={t("quick.date")} htmlFor="qe-date" hint={t("quick.dateHint")}>
                  <Input id="qe-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </Field>
              ) : (
                <Field label={t("inventory.unitCost")} htmlFor="qe-cost" hint={stockEffect === "sample" ? t("inventory.unitCostHintSample") : t("inventory.unitCostHintFactory")}>
                  <Input
                    id="qe-cost"
                    inputMode="decimal"
                    value={shownCost}
                    onChange={(e) => {
                      setUnitCostText(e.target.value);
                      setCostTouched(true);
                    }}
                    placeholder="0.00"
                    className="tabular"
                  />
                </Field>
              )}
            </div>
          ) : null}

          <div className="mt-4">
            <Field label={t("quick.platform")} hint={t("quick.platformHint")}>
              <Chips label={t("quick.platform")} options={PLATFORMS.map((p) => ({ value: p, label: platformName(t, p) }))} value={platform} onChange={setPlatform} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label={isIncome ? t("quick.receivedBy") : t("quick.paidBy")} hint={isIncome ? t("quick.receivedByHint") : t("quick.paidByHint")}>
              <Chips label={isIncome ? t("quick.receivedBy") : t("quick.paidBy")} options={PEOPLE.map((p) => ({ value: p, label: t(`common.${p}`) }))} value={person} onChange={setPerson} />
            </Field>
          </div>

          {isIncome ? null : (
            <div className="mt-4">
              <Field label={t("quick.date")} htmlFor="qe-date2" hint={t("quick.dateHint")}>
                <Input id="qe-date2" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
            </div>
          )}

          {isIncome ? (
            <div className="mt-4">
              <Field label={t("quick.customer")} htmlFor="qe-customer" hint={t("quick.customerHint")}>
                <Input id="qe-customer" list="qe-customers" value={customer} onChange={(e) => setCustomer(e.target.value)} autoComplete="off" placeholder={t("common.optional")} />
                <datalist id="qe-customers">
                  {customerNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
            </div>
          ) : null}

          <div className="mt-4">
            {showNote ? (
              <Field label={t("quick.note")} htmlFor="qe-note" hint={t("quick.noteHint")}>
                <Textarea id="qe-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" />
              </Field>
            ) : (
              <button type="button" onClick={() => setShowNote(true)} className="min-h-11 text-sm font-medium text-berry hover:underline">
                + {t("quick.addNote")}
              </button>
            )}
          </div>

          <Link href="/import" onClick={close} className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-lavender bg-card px-4 py-3 transition-colors hover:bg-lavender-tint">
            <CameraIcon className="h-6 w-6 shrink-0 text-berry" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-plum">{t("quick.import")} →</span>
              <span className="block text-xs text-plum-soft">{t("quick.importHint")}</span>
            </span>
          </Link>
        </form>

        <div className={cn("border-t border-line bg-ivory px-5 pt-3 pb-4 pb-safe", (transferMode || orderMode) && "hidden")}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button type="button" disabled={busy} onClick={() => void save(false)} className="min-h-12 text-base">
              {t("quick.save")}
            </Button>
            <Button type="button" disabled={busy} variant="secondary" onClick={() => void save(true)} className="min-h-12">
              {t("quick.saveAnother")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
