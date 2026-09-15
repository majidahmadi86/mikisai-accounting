"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

const TOUR_KEY = "mikisai.tour.v1";
const STEPS = [1, 2, 3, 4, 5] as const;

type StepKey = `tour.step${(typeof STEPS)[number]}Title` | `tour.step${(typeof STEPS)[number]}Body`;

function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_KEY) === "done";
  } catch {
    return true;
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_KEY, "done");
  } catch {
    // Storage unavailable: the tour simply shows again next visit.
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

/**
 * Five-step first-run walkthrough. With autoOpen it shows once per device;
 * with forceOpen it opens on demand (More → Help). Pass a fresh key to
 * restart from step one.
 */
export function Tour({ autoOpen = false, forceOpen = false, onClose }: { autoOpen?: boolean; forceOpen?: boolean; onClose?: () => void }) {
  const t = useT();
  // Server snapshot says "seen" so the dialog never renders during SSR and hydration stays clean.
  const seen = useSyncExternalStore(subscribe, tourSeen, () => true);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const open = forceOpen || (autoOpen && !seen && !dismissed);

  function close() {
    markTourSeen();
    setDismissed(true);
    onClose?.();
  }

  if (!open) return null;
  const n = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <button type="button" aria-label={t("quick.close")} onClick={close} className="absolute inset-0 bg-plum/45" />
      <div className="relative w-full max-w-md rounded-t-[24px] bg-ivory p-6 shadow-[0_-10px_40px_rgba(48,35,51,0.25)] md:rounded-[24px]">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">{t("tour.eyebrow", { n: step + 1, total: STEPS.length })}</p>
          <button type="button" onClick={close} aria-label={t("quick.close")} className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint">
            <CloseIcon />
          </button>
        </div>
        <h2 id="tour-title" className="mt-2 text-2xl text-plum">
          {t(`tour.step${n}Title` as StepKey)}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-plum-soft">{t(`tour.step${n}Body` as StepKey)}</p>
        <div className="mt-5 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-berry" : "w-1.5 bg-lavender")} />
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
              {t("common.back")}
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={close}>
              {t("tour.skip")}
            </Button>
          )}
          <Button type="button" className="flex-1" onClick={() => (last ? close() : setStep((s) => s + 1))}>
            {last ? t("tour.done") : t("tour.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
