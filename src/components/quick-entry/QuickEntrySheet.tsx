"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { CameraIcon, CloseIcon } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n/client";
import { categoryName, platformName, productName } from "@/lib/labels";
import type { TransactionInput } from "@/lib/ledger/transaction-input";
import { round2, thb, todayIso } from "@/lib/money";
import { estimateNet } from "@/lib/parse/estimate";
import { EXPENSE_CATEGORIES, PEOPLE, PLATFORMS, PRODUCT_LINES, type ExpenseCategory, type Person, type Platform, type ProductLine, type TransactionType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useQuickEntry } from "./QuickEntryProvider";

const STORAGE_KEY = "mikisai.quick-entry.v1";

type Remembered = { platform?: Platform; product?: ProductLine; category?: ExpenseCategory };

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

export function QuickEntrySheet({ initialType, retryInput }: { initialType: TransactionType; retryInput: TransactionInput | null }) {
  const t = useT();
  const { close, data, submit } = useQuickEntry();
  const remembered = useMemo(() => readRemembered(), []);

  const [type, setType] = useState<TransactionType>(retryInput?.type ?? initialType);
  const [amountText, setAmountText] = useState(() => {
    if (!retryInput) return "";
    return String(retryInput.type === "income" ? retryInput.gross_amount : retryInput.amount);
  });
  const [netText, setNetText] = useState(() => (retryInput?.type === "income" && retryInput.net_amount != null ? String(retryInput.net_amount) : ""));
  const [editNet, setEditNet] = useState(() => retryInput?.type === "income" && retryInput.net_amount != null);
  const [date, setDate] = useState(retryInput?.date ?? todayIso());
  const [platform, setPlatform] = useState<Platform>(retryInput?.platform ?? remembered.platform ?? data.lastPlatform);
  const [product, setProduct] = useState<ProductLine>(retryInput?.product_line ?? remembered.product ?? data.lastProduct);
  const [quantity, setQuantity] = useState<number>(retryInput?.quantity ?? 1);
  const [person, setPerson] = useState<Person>(retryInput ? (retryInput.type === "income" ? retryInput.received_by : retryInput.payer) : data.person);
  const [category, setCategory] = useState<ExpenseCategory>(retryInput?.type === "expense" ? retryInput.category : remembered.category ?? "product_cost");
  const [customer, setCustomer] = useState(retryInput?.type === "income" ? (retryInput.customer_name ?? "") : "");
  const [note, setNote] = useState(retryInput?.note ?? "");
  const [showNote, setShowNote] = useState(Boolean(retryInput?.note));
  const [error, setError] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);

  // Focus the amount with the numeric keypad, lock page scroll, close on Escape.
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

  const amount = parseAmount(amountText);
  const estimate = amount != null ? estimateNet(amount, platform, data.settings) : null;
  const netOverride = editNet ? parseAmount(netText) : null;
  const isIncome = type === "income";

  const customerNames = useMemo(() => {
    const seen = new Set<string>();
    return data.customers.map((c) => c.name).filter((n) => (seen.has(n.toLowerCase()) ? false : (seen.add(n.toLowerCase()), true)));
  }, [data.customers]);

  function buildInput(): TransactionInput | null {
    if (amount == null || amount <= 0) {
      setError(t("quick.amountRequired"));
      amountRef.current?.focus();
      return null;
    }
    setError(null);
    if (isIncome) {
      return {
        type: "income",
        date,
        platform,
        product_line: product,
        gross_amount: amount,
        net_amount: netOverride ?? estimate ?? amount,
        quantity,
        received_by: person,
        customer_name: customer.trim() || undefined,
        note: note.trim() || undefined,
      };
    }
    return {
      type: "expense",
      date,
      platform,
      product_line: product,
      amount,
      quantity,
      payer: person,
      category,
      note: note.trim() || undefined,
    };
  }

  function save(keepOpen: boolean) {
    const input = buildInput();
    if (!input) return;
    remember({ platform, product, category });
    submit(input, keepOpen);
    if (keepOpen) {
      setAmountText("");
      setNetText("");
      setEditNet(false);
      setCustomer("");
      setNote("");
      setQuantity(1);
      window.setTimeout(() => amountRef.current?.focus(), 30);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="quick-entry-title">
      <button type="button" aria-label={t("quick.close")} onClick={close} className="absolute inset-0 bg-plum/45 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-ivory shadow-[0_-10px_40px_rgba(48,35,51,0.25)] md:max-h-[90vh] md:max-w-lg md:rounded-[24px]">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            <p className="eyebrow">{t("nav.add")}</p>
            <h2 id="quick-entry-title" className="text-2xl text-plum">
              {t("quick.title")}
            </h2>
            <p className="text-xs text-plum-soft">{t("quick.subtitle")}</p>
          </div>
          <button type="button" onClick={close} aria-label={t("quick.close")} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint hover:text-plum">
            <CloseIcon />
          </button>
        </div>

        <form
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("common.type")}>
            {(["income", "expense"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={type === v}
                onClick={() => setType(v)}
                className={cn(
                  "min-h-14 rounded-2xl border text-base font-medium transition-colors",
                  type === v ? "border-berry bg-berry text-ivory shadow-[0_2px_10px_rgba(143,49,95,0.3)]" : "border-line bg-card text-plum hover:bg-lavender-tint",
                )}
              >
                {v === "income" ? t("quick.income") : t("quick.expense")}
              </button>
            ))}
          </div>

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
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
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
                      <Button type="button" variant="ghost" onClick={() => { setEditNet(false); setNetText(""); }}>
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
                <Chips label={t("quick.category")} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryName(t, c) }))} value={category} onChange={setCategory} />
              </Field>
            </div>
          )}

          <div className="mt-4">
            <Field label={t("quick.platform")} hint={t("quick.platformHint")}>
              <Chips label={t("quick.platform")} options={PLATFORMS.map((p) => ({ value: p, label: platformName(t, p) }))} value={platform} onChange={setPlatform} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label={t("quick.product")} hint={t("quick.productHint")}>
              <Chips label={t("quick.product")} options={PRODUCT_LINES.map((p) => ({ value: p, label: productName(t, p) }))} value={product} onChange={setProduct} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label={isIncome ? t("quick.receivedBy") : t("quick.paidBy")} hint={isIncome ? t("quick.receivedByHint") : t("quick.paidByHint")}>
              <Chips label={isIncome ? t("quick.receivedBy") : t("quick.paidBy")} options={PEOPLE.map((p) => ({ value: p, label: t(`common.${p}`) }))} value={person} onChange={setPerson} />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label={t("quick.date")} htmlFor="qe-date" hint={t("quick.dateHint")}>
              <Input id="qe-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label={t("quick.quantity")} htmlFor="qe-qty" hint={t("quick.quantityHint")}>
              <div className="flex min-h-11 items-stretch overflow-hidden rounded-xl border border-line bg-card">
                <button type="button" aria-label="-1" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-11 text-lg text-plum-soft hover:bg-lavender-tint">
                  −
                </button>
                <input
                  id="qe-qty"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(100000, Math.floor(Number(e.target.value) || 1))))}
                  className="w-full border-x border-line bg-card text-center text-sm tabular focus:outline-none"
                />
                <button type="button" aria-label="+1" onClick={() => setQuantity((q) => Math.min(100000, q + 1))} className="w-11 text-lg text-plum-soft hover:bg-lavender-tint">
                  +
                </button>
              </div>
            </Field>
          </div>

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

        <div className="border-t border-line bg-ivory px-5 pt-3 pb-4 pb-safe">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button type="button" onClick={() => save(false)} className="min-h-12 text-base">
              {t("quick.save")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => save(true)} className="min-h-12">
              {t("quick.saveAnother")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
