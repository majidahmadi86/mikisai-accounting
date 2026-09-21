"use client";

import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Icons";
import { useQuickEntry } from "@/components/quick-entry/QuickEntryProvider";
import type { AddKind, AddOptions } from "@/components/quick-entry/QuickEntryProvider";

/** Opens the quick-entry sheet. Used in the desktop header and on page empty states. */
export function AddButton({ label, kind, stockFirst, transfer, withIcon = true, variant = "primary", className, iconOnlyOnTablet = false }: { label: string; kind?: AddKind; stockFirst?: boolean; transfer?: AddOptions["transfer"]; withIcon?: boolean; variant?: "primary" | "secondary" | "ghost"; className?: string; iconOnlyOnTablet?: boolean }) {
  const { open } = useQuickEntry();
  return (
    <Button type="button" variant={variant} onClick={() => open(kind, { stockFirst, transfer })} className={className} aria-label={label} title={label}>
      {withIcon ? <PlusIcon className="h-4 w-4" /> : null}
      <span className={iconOnlyOnTablet ? "md:max-lg:sr-only" : undefined}>{label}</span>
    </Button>
  );
}
