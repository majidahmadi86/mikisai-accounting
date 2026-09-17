"use client";

import { Button } from "@/components/ui/Button";
import { useQuickEntry } from "@/components/quick-entry/QuickEntryProvider";
import { useT } from "@/lib/i18n/client";

/** The one way to record a transfer from Home: opens the bottom sheet in transfer mode. */
export function RecordTransferButton({ className }: { className?: string }) {
  const t = useT();
  const { open } = useQuickEntry();
  return (
    <Button type="button" onClick={() => open("transfer")} className={className}>
      {t("transfer.title")}
    </Button>
  );
}
