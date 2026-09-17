"use client";

import { useState } from "react";
import { Chips } from "@/components/ui/Chips";
import { useT } from "@/lib/i18n/client";
import { TRANSFER_REASONS, type TransferReason } from "@/lib/types";

/**
 * Why the money moved, as large chips. The kind (settlement or capital) is
 * derived from the reason in the database, so there is nothing else to pick.
 * Exposes the chosen reason so the form can require a note for "other".
 */
export function ReasonChips({ defaultValue = "profit_share", onChange }: { defaultValue?: TransferReason; onChange?: (r: TransferReason) => void }) {
  const t = useT();
  const [reason, setReason] = useState<TransferReason>(defaultValue);
  return (
    <div>
      <Chips
        name="reason"
        label={t("transfer.reason")}
        value={reason}
        size="lg"
        onChange={(r) => {
          setReason(r);
          onChange?.(r);
        }}
        options={TRANSFER_REASONS.map((r) => ({ value: r, label: t(`transfer.reason.${r}`) }))}
      />
      <p className="mt-1.5 text-xs leading-relaxed text-plum-soft">{t(`transfer.reasonHint.${reason}`)}</p>
      {reason === "other" ? <p className="mt-1 text-xs font-medium text-berry">{t("transfer.otherNeedsNote")}</p> : null}
    </div>
  );
}
