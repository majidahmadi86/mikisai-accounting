"use client";

import { useMemo, useState } from "react";
import { quickAddTransaction } from "@/app/(app)/transactions/actions";
import { ProductPicker } from "@/components/products/ProductPicker";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { Field, Input } from "@/components/ui/Field";
import { useLocale, useT } from "@/lib/i18n/client";
import { expectedNetPerUnit, salePriceFor } from "@/lib/inventory/product-stats";
import { shortProductName } from "@/lib/inventory/units";
import type { TransactionInput } from "@/lib/ledger/transaction-input";
import { round2, thb, todayIso } from "@/lib/money";
import { SETTLEMENT_STATUSES, type Platform, type SettlementStatus } from "@/lib/types";
import { statusName } from "@/lib/labels";
import { useQuickEntry } from "./QuickEntryProvider";

/**
 * Quick order, the manual fallback for the phone: order ID, a quantity
 * stepper and what you receive, prefilled from the expected net per unit.
 * The product and platform come from the last sale; one tap saves.
 */
export function QuickOrderSheet({ onSaved, onError }: { onSaved: (message: string) => void; onError: (message: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const { data } = useQuickEntry();
  const products = useMemo(() => data.products.filter((p) => p.active), [data.products]);
  const [productId, setProductId] = useState<string>(() => (data.lastProductId && products.some((p) => p.id === data.lastProductId) ? data.lastProductId : (products[0]?.id ?? "")));
  const [platform] = useState<Platform>(data.lastPlatform);
  const [orderRef, setOrderRef] = useState("");
  const [qty, setQty] = useState(1);
  const [receiveText, setReceiveText] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<SettlementStatus>("pending");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const product = products.find((p) => p.id === productId) ?? null;
  const fee = data.settings.find((s) => s.platform === platform)?.commission_pct ?? 0;
  const perUnit = product ? expectedNetPerUnit(product, fee) : 0;
  const prefill = perUnit > 0 ? String(round2(perUnit * qty)) : "";
  const shown = touched ? receiveText : prefill;
  const receive = round2(Number(shown.replace(/[,\s฿]/g, "")) || 0);
  const listPrice = product ? salePriceFor(product, platform) : 0;

  async function save() {
    if (!product) return setError(t("import.needProducts"));
    if (!(receive > 0)) return setError(t("quick.amountRequired"));
    setError(null);
    setBusy(true);
    const gross = listPrice > 0 ? round2(listPrice * qty) : receive;
    const input: TransactionInput = {
      type: "income",
      date: todayIso(),
      platform,
      product_line: product.product_line,
      gross_amount: gross,
      net_amount: receive,
      quantity: qty,
      received_by: data.person,
      order_ref: orderRef.trim() || undefined,
      settlement_status: status,
      items: [{ product_id: product.id, qty, unit_price: round2(gross / qty) }],
    };
    const result = await quickAddTransaction(input, "quick");
    setBusy(false);
    if (!result.ok) return onError(result.error === "duplicate" ? t("transactions.duplicate", { date: result.duplicate?.date ?? "?", amount: thb(result.duplicate?.net_amount ?? 0) }) : t("quick.failed"));
    onSaved(t("quick.orderSaved", { qty, amount: thb(receive) }));
  }

  return (
    <form
      className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-lavender-tint px-4 py-3 text-sm text-plum">
        <span>
          {product ? shortProductName(product, locale) : t("import.unmatched")} · {t(`platform.${platform}`)}
        </span>
        <button type="button" onClick={() => setPickerOpen((v) => !v)} className="min-h-8 text-xs font-medium text-berry hover:underline">
          {t("common.change")}
        </button>
      </div>
      {pickerOpen ? (
        <div className="mt-2">
          <ProductPicker id="qo-product" products={products} value={productId} onChange={(id) => { setProductId(id); setPickerOpen(false); }} label={t("inventory.product")} />
        </div>
      ) : null}

      <div className="mt-4">
        <Field label={t("transactions.orderRef")} htmlFor="qo-ref" hint={t("quick.orderRefHint")}>
          <Input id="qo-ref" inputMode="numeric" autoComplete="off" value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="5860…" className="font-mono" />
        </Field>
      </div>

      <div className="mt-4">
        <p className="eyebrow mb-1.5">{t("import.qty")}</p>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t("quick.qtyLess")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card text-xl text-plum">
            -
          </button>
          <input inputMode="numeric" aria-label={t("import.qty")} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="min-h-12 w-20 rounded-2xl border border-line bg-card text-center font-display text-2xl tabular text-plum focus:border-berry focus:outline-none" />
          <button type="button" aria-label={t("quick.qtyMore")} onClick={() => setQty((q) => Math.min(999, q + 1))} className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card text-xl text-plum">
            +
          </button>
          <span className="text-xs text-plum-faint">{product ? t(`products.unit.${product.unit_label as "box"}`) : ""}</span>
        </div>
      </div>

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
        <Field label={t("common.status")}>
          <Chips label={t("common.status")} options={SETTLEMENT_STATUSES.map((s) => ({ value: s, label: statusName(t, s) }))} value={status} onChange={setStatus} />
        </Field>
      </div>

      {error ? <p className="mt-3 rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{error}</p> : null}
      <div className="mt-5">
        <Button type="submit" disabled={busy} className="min-h-12 w-full text-base">
          {t("quick.saveOrder")}
        </Button>
      </div>
    </form>
  );
}
