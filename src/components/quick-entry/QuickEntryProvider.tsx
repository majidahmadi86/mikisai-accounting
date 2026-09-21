"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { quickAddTransaction, removeTransaction } from "@/app/(app)/transactions/actions";
import type { TransactionInput } from "@/lib/ledger/transaction-input";
import { useT } from "@/lib/i18n/client";
import { thb } from "@/lib/money";
import type { ExpenseCategory } from "@/lib/categories";
import type { Product } from "@/lib/inventory/valuation";
import type { Customer, Person, Platform, PlatformSetting, ProductLine, TransferReason } from "@/lib/types";
import { Toast, type ToastState } from "./Toast";

/** Everything the sheet needs, resolved on the server once per layout render. */
export type QuickEntryContextData = {
  person: Person;
  lastPlatform: Platform;
  lastProduct: ProductLine;
  settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[];
  customers: Pick<Customer, "name" | "platform">[];
  categories: ExpenseCategory[];
  products: Product[];
  lastProductId: string | null;
  /** Units sold or given away per product that no purchase has covered yet. */
  backlog: Record<string, number>;
};

export type Notice = { message: string; actionLabel?: string; onAction?: () => void | Promise<void>; durationMs?: number };

/** The four things the Add sheet records. */
export type AddKind = "sale" | "expense" | "transfer" | "payout";

/** `stockFirst` starts Expense on Stock purchase; `transfer` fills Money moved in (My Balance, Investment). */
export type AddOptions = { stockFirst?: boolean; transfer?: { from: Person; amount: number; reason: TransferReason } };

type Ctx = {
  open: (kind?: AddKind, opts?: AddOptions) => void;
  close: () => void;
  isOpen: boolean;
  data: QuickEntryContextData;
  submit: (input: TransactionInput, keepOpen: boolean, note?: string) => void;
  /** Shows a toast with an optional one-tap action (used for delete undo). */
  notify: (notice: Notice) => void;
};

const QuickEntryContext = createContext<Ctx | null>(null);

const AddSheet = dynamic(() => import("./AddSheet").then((m) => m.AddSheet), { ssr: false });

const UNDO_MS = 6000;

export function QuickEntryProvider({ data, children }: { data: QuickEntryContextData; children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  // The sheet belongs to the page it was opened on: a save that moves on (a payout opens its matching page) closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [initialKind, setInitialKind] = useState<AddKind>("sale");
  const [options, setOptions] = useState<AddOptions>({});
  const pathname = usePathname();
  const isOpen = openOn === pathname;
  const [toast, setToast] = useState<ToastState | null>(null);
  const [retryInput, setRetryInput] = useState<TransactionInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeAction = useRef<Notice["onAction"] | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const open = useCallback((kind: AddKind = "sale", opts?: AddOptions) => {
    setInitialKind(kind);
    setOptions(opts ?? {});
    setRetryInput(null);
    setOpenOn(pathname);
  }, [pathname]);
  const close = useCallback(() => setOpenOn(null), []);

  /**
   * Optimistic save: the sheet closes immediately and a toast with Undo
   * appears while the server action runs. On failure the toast offers to
   * reopen the sheet with the same values.
   */
  const submit = useCallback(
    (input: TransactionInput, keepOpen: boolean, note?: string) => {
      clearTimer();
      const amount = input.type === "income" ? (input.net_amount ?? input.gross_amount) : input.amount;
      const sign = input.type === "income" ? "+" : "-";
      if (!keepOpen) setOpenOn(null);
      noticeAction.current = null;
      setToast({ kind: "saving", message: t("quick.saved", { amount: `${sign}${thb(amount)}` }) });

      void (async () => {
        const result = await quickAddTransaction(input);
        if (!result.ok) {
          setRetryInput(input);
          const message = result.error === "reconcile" ? t("inventory.reconcileBlocked", { diff: thb(Math.abs(result.difference ?? 0)) }) : result.error === "unspecified" ? t("inventory.unspecifiedBlocked") : result.error === "duplicate" ? t("transactions.duplicate", { date: result.duplicate?.date ?? "?", amount: thb(result.duplicate?.net_amount ?? 0) }) : t("quick.failed");
          setToast({ kind: "error", message, actionLabel: t("quick.retry") });
          return;
        }
        router.refresh();
        const saved = t("quick.saved", { amount: `${sign}${thb(amount)}` });
        setToast({ kind: "saved", message: note ? `${saved} · ${note}` : saved, actionLabel: t("quick.undo"), id: result.id });
        timer.current = setTimeout(() => setToast(null), UNDO_MS);
      })();
    },
    [router, t],
  );

  const notify = useCallback((notice: Notice) => {
    clearTimer();
    router.refresh();
    noticeAction.current = notice.onAction ?? null;
    setToast({ kind: "saved", message: notice.message, actionLabel: notice.actionLabel });
    timer.current = setTimeout(() => setToast(null), notice.durationMs ?? 4000);
  }, [router]);

  const onToastAction = useCallback(() => {
    if (!toast) return;
    clearTimer();
    if (noticeAction.current) {
      const fn = noticeAction.current;
      noticeAction.current = null;
      setToast(null);
      void fn();
      return;
    }
    if (toast.kind === "error") {
      setToast(null);
      setOpenOn(pathname);
      return;
    }
    if (toast.kind === "saved" && toast.id) {
      const id = toast.id;
      setToast({ kind: "saving", message: t("quick.undone") });
      void (async () => {
        await removeTransaction(id);
        router.refresh();
        setToast({ kind: "saved", message: t("quick.undone") });
        timer.current = setTimeout(() => setToast(null), 2500);
      })();
    }
  }, [pathname, router, t, toast]);

  useEffect(() => clearTimer, []);

  const value = useMemo<Ctx>(() => ({ open, close, isOpen, data, submit, notify }), [open, close, isOpen, data, submit, notify]);

  return (
    <QuickEntryContext.Provider value={value}>
      {children}
      {isOpen ? <AddSheet initialKind={initialKind} retryInput={retryInput} options={options} /> : null}
      {toast ? <Toast state={toast} onAction={onToastAction} onDismiss={() => setToast(null)} /> : null}
    </QuickEntryContext.Provider>
  );
}

export function useQuickEntry(): Ctx {
  const ctx = useContext(QuickEntryContext);
  if (!ctx) throw new Error("useQuickEntry must be used inside QuickEntryProvider");
  return ctx;
}
