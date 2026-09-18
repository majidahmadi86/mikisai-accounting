"use client";

import { useState, useSyncExternalStore } from "react";
import { Card } from "@/components/ui/Card";
import { useT } from "@/lib/i18n/client";
import { isStandalone, platformHint } from "@/lib/pwa/shared-files";

const DISMISSED_KEY = "mikisai.install-card.v1";

function safeRead(key: string): boolean {
  try {
    return Boolean(window.localStorage.getItem(key));
  } catch {
    return false;
  }
}

/**
 * First-run card for the phone: install MikiSai, then share order screenshots
 * to it. Exact taps for iPhone and Android. Hidden once installed or dismissed.
 */
export function InstallCard() {
  const t = useT();
  // Rendered only after hydration, so the server and the first client paint agree.
  const client = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const alreadyDismissed = client ? safeRead(DISMISSED_KEY) : true;
  const show = client && !dismissed && !alreadyDismissed && !isStandalone();
  const platform = client ? platformHint() : "other";

  if (!show) return null;
  const steps = platform === "ios" ? [t("install.ios1"), t("install.ios2"), t("install.ios3"), t("install.ios4")] : [t("install.android1"), t("install.android2"), t("install.android3"), t("install.android4")];
  return (
    <Card tone="lavender" className="mb-6 px-5 py-5">
      <p className="eyebrow">{t("install.eyebrow")}</p>
      <p className="mt-1 font-display text-xl text-plum">{t("install.title")}</p>
      <p className="mt-1 text-sm text-plum-soft">{platform === "ios" ? t("install.subtitleIos") : t("install.subtitleAndroid")}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-plum">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {platform === "ios" ? <p className="mt-2 text-xs text-plum-faint">{t("install.iosNote")}</p> : null}
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISSED_KEY, "1");
          } catch {
            // ignore
          }
          setDismissed(true);
        }}
        className="mt-3 min-h-9 text-xs font-medium text-berry hover:underline"
      >
        {t("install.dismiss")}
      </button>
    </Card>
  );
}
