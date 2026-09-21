"use client";

import { useMemo, useState } from "react";
import { quickAddTransaction } from "@/app/(app)/transactions/actions";
import { ProductPicker } from "@/components/products/ProductPicker";
import { OrderRefField, orderRefReady, type OrderRefValue } from "@/components/transactions/OrderRefField";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { useLocale, useT } from "@/lib/i18n/client";
import { expectedNetPerUnit, salePriceFor } from "@/lib/inventory/product-stats";
import { shortProductName } from "@/lib/inventory/units";
import { platformName, statusName } from "@/lib/labels";
import type { TransactionInput } from "@/lib/ledger/transaction-input";
import { round2, thb, todayIso } from "@/lib/money";
import { PLATFORMS, SETTLEMENT_STATUSES, type Platform, type SettlementStatus } from "@/lib/types";
import { useQuickEntry } from "./QuickEntryProvider";

type Line = { productId: string; qty: number };

function Stepper({ value, onChange, less, more, label }: { value: number; onChange: (n: number) => void; less: string; more: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={less} onClick={() => onChange(Math.max(1, value - 1))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-card text-xl text-plum">
        -
      </button>
      <input inputMode="numeric" aria-label={label} value={value} onChange={(e) => onChange(Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))))} className="min-h-12 w-20 rounded-2xl border border-line bg-card text-center font-display text-2xl tabular text-plum focus:border-berry focus:outline-none" />
      <button type="button" aria-label={more} onClick={() => onChange(Math.min(999, value + 1))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-card text-xl text-plum">
        +
      </button>
    </div>
  );
}

/**
 * Sale: the one way to record a sale by hand. Order ID, how many, what you
 * receive (prefilled from what the product usually pays), and where the money
 * is. Everything else (customer, a second product, date, platform, note)
 * waits behind More.
 */
export function SaleSheet({ onSaved, onError }: { onSaved: (message: string) => void; onError: (message: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const { data } = useQuickEntry();
  const products = useMemo(() => data.products.filter((p) => p.active), [data.products]);
  const first = data.lastProductId && products.some((p) => p.id === data.lastProductId) ? data.lastProductId : (products[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([{ productId: first, qty: 1 }]);
  const [platform, setPlatform] = useState<Platform>(data.lastPlatform);
  const [orderRef, setOrderRef] = useState<OrderRefValue>({ orderRef: "", none: false, reason: "" });
  const [refChecked, setRefChecked] = useState(false);
  const [receiveText, setReceiveText] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<SettlementStatus>("pending");
  const [more, setMore] = useState(false);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [customer, setCustomer] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fee = data.settings.find((s) => s.platform === platform)?.commission_pct ?? 0;
  const resolved = lines.map((l) => ({ ...l, product: products.find((p) => p.id === l.productId) ?? null }));
  const perUnit = resolved[0]?.product ? expectedNetPerUnit(resolved[0].product, fee) : 0;
  const expected = round2(resolved.reduce((a, l) => a + (l.product ? expectedNetPerUnit(l.product, fee) * l.qty : 0), 0));
  const shown = touched ? receiveText : expected > 0 ? String(expected) : "";
  const receive = round2(Number(shown.replace(/[,\s฿]/g, "")) || 0);
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  async function save() {
    if (resolved.some((l) => !l.product)) return setError(t("import.needProducts"));
    if (!(receive > 0)) return setError(t("quick.amountRequired"));
    if (!orderRefReady(orderRef)) return setRefChecked(true);
    setError(null);
    setBusy(true);
    // Lines carry the list price when every product has one; otherwise what you receive is spread over the units.
    const priced = resolved.map((l) => ({ ...l, price: salePriceFor(l.product!, platform) }));
    const allPriced = priced.every((l) => l.price > 0);
    const spread = round2(receive / units);
    const items = priced.map((l) => ({ product_id: l.productId, qty: l.qty, unit_price: allPriced ? l.price : spread }));
    const gross = round2(items.reduce((a, i) => a + i.unit_price * i.qty, 0));
    const input: TransactionInput = {
      type: "income",
      date,
      platform,
      product_line: resolved[0].product!.product_line,
      gross_amount: gross,
      net_amount: receive,
      quantity: units,
      received_by: data.person,
      customer_name: customer.trim() || undefined,
      order_ref: orderRef.none ? undefined : orderRef.orderRef.trim(),
      no_order_ref_reason: orderRef.none ? orderRef.reason.trim() : undefined,
      note: note.trim() || undefined,
      settlement_status: status,
      items,
    };
    const result = await quickAddTransaction(input);
    setBusy(false);
    if (!result.ok) return onError(result.error === "duplicate" ? t("transactions.duplicate", { date: result.duplicate?.date ?? "?", amount: thb(result.duplicate?.net_amount ?? 0) }) : result.error === "reconcile" ? t("inventory.reconcileBlocked", { diff: thb(Math.abs(result.difference ?? 0)) }) : t("quick.failed"));
    onSaved(t("quick.orderSaved", { qty: units, amount: thb(receive) }));
  }

  return (
    <form
      className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="mt-2">
        <OrderRefField id="qo-ref" value={orderRef} onChange={setOrderRef} hint={t("quick.orderRefHint")} showError={refChecked} />
      </div>

      {resolved.map((l, i) => (
        <div key={i} className="mt-4 rounded-2xl bg-lavender-tint px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-plum">
            <span className="min-w-0 truncate font-medium">{l.product ? shortProductName(l.product, locale) : t("import.unmatched")}</span>
            <span className="flex items-center gap-3">
              <button type="button" onClick={() => setPickerFor(pickerFor === i ? null : i)} className="min-h-8 text-xs font-medium text-berry hover:underline">
                {t("common.change")}
              </button>
              {i > 0 ? (
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} className="min-h-8 text-xs font-medium text-plum-soft hover:underline">
                  {t("common.remove")}
                </button>
              ) : null}
            </span>
          </div>
          {pickerFor === i ? (
            <div className="mt-2">
              <ProductPicker
                id={`qo-product-${i}`}
                products={products}
                value={l.productId}
                onChange={(id) => {
                  setLine(i, { productId: id });
                  setPickerFor(null);
                }}
                label={t("inventory.product")}
              />
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-3">
            <Stepper value={l.qty} onChange={(qty) => setLine(i, { qty })} less={t("quick.qtyLess")} more={t("quick.qtyMore")} label={t("import.qty")} />
            <span className="text-xs text-plum-faint">{l.product ? t(`products.unit.${l.product.unit_label as "box"}`) : ""}</span>
          </div>
        </div>
      ))}

      <div className="mt-4">
        <Field label={t("quick.orderReceive")} htmlFor="qo-receive" hint={perUnit > 0 ? t("quick.orderReceiveHint", { amount: thb(perUnit) }) : t("quick.orderReceiveNoHint")}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-display text-2xl text-plum-faint">฿</span>
            <input
              id="qo-receive"
              inputMode="decimal"
              autoComplete="off"
              value={shown}
              onChange={(e) => {
                setReceiveText(e.target.value);
                setTouched(true);
              }}
              placeholder="0.00"
              className="w-full min-h-16 rounded-2xl border border-line bg-card pl-11 pr-4 font-display text-3xl tabular text-plum placeholder:text-plum-faint focus:border-berry focus:outline-none focus:ring-2 focus:ring-lavender"
            />
          </div>
        </Field>
      </div>

      <div className="mt-4">
        <Field label={t("sale.where")}>
          <Chips label={t("sale.where")} options={SETTLEMENT_STATUSES.map((s) => ({ value: s, label: statusName(t, s, platform) }))} value={status} onChange={setStatus} />
        </Field>
      </div>

      <div className="mt-4">
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="min-h-11 text-sm font-medium text-berry hover:underline">
          {more ? t("sale.less") : t("sale.more")}
        </button>
        {more ? (
          <div className="mt-1 space-y-4">
            <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, { productId: products.find((p) => !ls.some((l) => l.productId === p.id))?.id ?? first, qty: 1 }])}>
              + {t("sale.addProduct")}
            </Button>
            <Field label={t("quick.customer")} htmlFor="qo-customer">
              <Input id="qo-customer" list="qo-customers" value={customer} onChange={(e) => setCustomer(e.target.value)} autoComplete="off" placeholder={t("common.optional")} />
              <datalist id="qo-customers">
                {Array.from(new Set(data.customers.map((c) => c.name))).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("quick.date")} htmlFor="qo-date">
                <Input id="qo-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
            </div>
            <Field label={t("quick.platform")}>
              <Chips label={t("quick.platform")} options={PLATFORMS.map((p) => ({ value: p, label: platformName(t, p) }))} value={platform} onChange={setPlatform} />
            </Field>
            <Field label={t("quick.note")} htmlFor="qo-note">
              <Textarea id="qo-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
            </Field>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{error}</p> : null}
      <div className="mt-5">
        <Button type="submit" disabled={busy} className="min-h-12 w-full text-base">
          {t("sale.save")}
        </Button>
      </div>
    </form>
  );
}
