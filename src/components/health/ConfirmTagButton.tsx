"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmTag } from "@/app/(app)/import/actions";
import { useT } from "@/lib/i18n/client";

/** One tap: the assumed date on an imported row is right; the gold tag goes and Data health stops listing it. */
export function ConfirmTagButton({ id, tag }: { id: string; tag: "date_assumed" | "qty_inferred" }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return <span className="text-xs text-success">{t("common.saved")}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await confirmTag(id, tag);
          if (r.ok) {
            setDone(true);
            router.refresh();
          }
        })
      }
      className="min-h-8 shrink-0 rounded-full border border-line bg-card px-3 text-xs font-medium text-berry hover:border-berry disabled:opacity-50"
    >
      {tag === "date_assumed" ? t("health.confirmDate") : t("health.confirmQty")}
    </button>
  );
}
