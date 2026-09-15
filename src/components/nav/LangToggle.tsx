"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import { LOCALES, type Locale } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/cn";

export function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex rounded-full border border-line bg-card p-0.5 text-xs font-medium" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          disabled={pending}
          className={cn(
            "rounded-full px-3 py-1.5 transition-colors min-h-9",
            l === locale ? "bg-plum text-ivory" : "text-plum-soft hover:text-plum",
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
