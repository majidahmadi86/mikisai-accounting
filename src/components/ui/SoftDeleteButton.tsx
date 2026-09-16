"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { restore, softDelete, type SoftDeleteEntity } from "@/app/(app)/deleted/actions";
import { useQuickEntry } from "@/components/quick-entry/QuickEntryProvider";
import { useT } from "@/lib/i18n/client";
import { Button, type ButtonVariant } from "./Button";

const UNDO_MS = 10_000;

/**
 * Admin delete control. Soft-deletes at once and shows a ten second Undo
 * toast; the row can also be restored later from More → Recently deleted.
 */
export function SoftDeleteButton({ entity, id, afterHref, label, variant = "danger", className }: { entity: SoftDeleteEntity; id: string; afterHref?: string; label?: string; variant?: ButtonVariant; className?: string }) {
  const t = useT();
  const router = useRouter();
  const { notify } = useQuickEntry();
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await softDelete(entity, id);
          if (!result.ok) {
            notify({ message: t("roles.denied") });
            return;
          }
          if (afterHref) router.push(afterHref);
          else router.refresh();
          notify({
            message: t("deleted.done"),
            actionLabel: t("deleted.undo"),
            durationMs: UNDO_MS,
            onAction: async () => {
              const r = await restore(entity, id);
              notify({ message: r.ok ? t("deleted.restored") : t("roles.denied") });
              router.refresh();
            },
          });
        })
      }
    >
      {label ?? t("common.delete")}
    </Button>
  );
}
