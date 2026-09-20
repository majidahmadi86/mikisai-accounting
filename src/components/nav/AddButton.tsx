"use client";

import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Icons";
import { useQuickEntry } from "@/components/quick-entry/QuickEntryProvider";
import type { TransactionType } from "@/lib/types";

/** Opens the quick-entry sheet. Used in the desktop header and on page empty states. */
export function AddButton({ label, type, variant = "primary", className, iconOnlyOnTablet = false }: { label: string; type?: TransactionType; variant?: "primary" | "secondary" | "ghost"; className?: string; iconOnlyOnTablet?: boolean }) {
  const { open } = useQuickEntry();
  return (
    <Button type="button" variant={variant} onClick={() => open(type)} className={className} aria-label={label} title={label}>
      <PlusIcon className="h-4 w-4" />
      <span className={iconOnlyOnTablet ? "md:max-lg:sr-only" : undefined}>{label}</span>
    </Button>
  );
}
