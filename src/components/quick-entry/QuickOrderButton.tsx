"use client";

import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";
import { useQuickEntry } from "./QuickEntryProvider";

/** Opens the bottom sheet in quick-order mode: order ID, quantity, what you receive. */
export function QuickOrderButton({ className, variant = "secondary" }: { className?: string; variant?: "primary" | "secondary" | "ghost" }) {
  const t = useT();
  const { open } = useQuickEntry();
  return (
    <Button type="button" variant={variant} className={className} onClick={() => open("order")}>
      {t("quick.orderTitle")}
    </Button>
  );
}
