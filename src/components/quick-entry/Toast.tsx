"use client";

import { CloseIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

export type ToastState = {
  kind: "saving" | "saved" | "error";
  message: string;
  actionLabel?: string;
  id?: string;
};

export function Toast({ state, onAction, onDismiss }: { state: ToastState; onAction: () => void; onDismiss: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6" role="status" aria-live="polite">
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-[0_10px_30px_rgba(48,35,51,0.25)]",
          state.kind === "error" ? "bg-berry text-ivory" : "bg-plum text-ivory",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{state.message}</span>
        {state.actionLabel ? (
          <button type="button" onClick={onAction} className="min-h-9 rounded-full bg-ivory/15 px-3 text-xs font-semibold uppercase tracking-wide hover:bg-ivory/25">
            {state.actionLabel}
          </button>
        ) : null}
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-ivory/15">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
