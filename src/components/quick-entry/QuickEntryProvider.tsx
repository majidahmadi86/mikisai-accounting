"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { quickAddTransaction, removeTransaction } from "@/app/(app)/transactions/actions";
import type { TransactionInput } from "@/lib/ledger/transaction-input";
import { useT } from "@/lib/i18n/client";
import { thb } from "@/lib/money";
import type { Customer, Person, Platform, PlatformSetting, ProductLine, TransactionType } from "@/lib/types";
import { Toast, type ToastState } from "./Toast";

/** Everything the sheet needs, resolved on the server once per layout render. */
export type QuickEntryContextData = {
  person: Person;
  lastPlatform: Platform;
  lastProduct: ProductLine;
  settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[];
  customers: Pick<Customer, "name" | "platform">[];
};

type Ctx = {
  open: (type?: TransactionType) => void;
  close: () => void;
  isOpen: boolean;
  data: QuickEntryContextData;
  submit: (input: TransactionInput, keepOpen: boolean) => void;
};

const QuickEntryContext = createContext<Ctx | null>(null);

const QuickEntrySheet = dynamic(() => import("./QuickEntrySheet").then((m) => m.QuickEntrySheet), { ssr: false });

const UNDO_MS = 6000;

export function QuickEntryProvider({ data, children }: { data: QuickEntryContextData; children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>("income");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [retryInput, setRetryInput] = useState<TransactionInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const open = useCallback((type: TransactionType = "income") => {
    setInitialType(type);
    setRetryInput(null);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  /**
   * Optimistic save: the sheet closes immediately and a toast with Undo
   * appears while the server action runs. On failure the toast offers to
   * reopen the sheet with the same values.
   */
  const submit = useCallback(
    (input: TransactionInput, keepOpen: boolean) => {
      clearTimer();
      const amount = input.type === "income" ? (input.net_amount ?? input.gross_amount) : input.amount;
      const sign = input.type === "income" ? "+" : "-";
      if (!keepOpen) setOpen(false);
      setToast({ kind: "saving", message: t("quick.saved", { amount: `${sign}${thb(amount)}` }) });

      void (async () => {
        const result = await quickAddTransaction(input);
        if (!result.ok) {
          setRetryInput(input);
          setToast({ kind: "error", message: t("quick.failed"), actionLabel: t("quick.retry") });
          return;
        }
        router.refresh();
        setToast({ kind: "saved", message: t("quick.saved", { amount: `${sign}${thb(amount)}` }), actionLabel: t("quick.undo"), id: result.id });
        timer.current = setTimeout(() => setToast(null), UNDO_MS);
      })();
    },
    [router, t],
  );

  const onToastAction = useCallback(() => {
    if (!toast) return;
    clearTimer();
    if (toast.kind === "error") {
      setToast(null);
      setOpen(true);
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
  }, [router, t, toast]);

  useEffect(() => clearTimer, []);

  const value = useMemo<Ctx>(() => ({ open, close, isOpen, data, submit }), [open, close, isOpen, data, submit]);

  return (
    <QuickEntryContext.Provider value={value}>
      {children}
      {isOpen ? <QuickEntrySheet initialType={initialType} retryInput={retryInput} /> : null}
      {toast ? <Toast state={toast} onAction={onToastAction} onDismiss={() => setToast(null)} /> : null}
    </QuickEntryContext.Provider>
  );
}

export function useQuickEntry(): Ctx {
  const ctx = useContext(QuickEntryContext);
  if (!ctx) throw new Error("useQuickEntry must be used inside QuickEntryProvider");
  return ctx;
}
