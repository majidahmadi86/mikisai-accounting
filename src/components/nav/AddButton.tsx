"use client";

import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Icons";
import { useQuickEntry } from "@/components/quick-entry/QuickEntryProvider";
import type { TransactionType } from "@/lib/types";

/** Opens the quick-entry sheet. Used in the desktop header and on page empty states. */
export function AddButton({ label, type, variant = "primary", className }: { label: string; type?: TransactionType; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const { open } = useQuickEntry();
  return (
    <Button type="button" variant={variant} onClick={() => open(type)} className={className}>
      <PlusIcon className="h-4 w-4" />
      {label}
    </Button>
  );
}
