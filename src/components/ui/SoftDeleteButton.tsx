"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { restore, softDelete } from "@/app/(app)/deleted/actions";
import type { SoftDeleteEntity } from "@/lib/soft-delete";
import { useQuickEntry } from "@/components/quick-entry/QuickEntryProvider";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { Button, type ButtonVariant } from "./Button";
import { TrashIcon } from "./Icons";

const UNDO_MS = 10_000;

/**
 * Admin delete control. Soft-deletes at once and shows a ten second Undo
 * toast; the row can also be restored later from More → Recently deleted.
 * Only the one row is ever deleted; when another row has the same amount and
 * date, the admin is asked first so the wrong twin is not the one that goes.
 */
export function SoftDeleteButton({
  entity,
  id,
  afterHref,
  label,
  variant = "danger",
  className,
  icon = false,
  confirmOnly = false,
}: {
  entity: SoftDeleteEntity;
  id: string;
  afterHref?: string;
  label?: string;
  variant?: ButtonVariant;
  className?: string;
  /** A 44px bin icon with a tooltip, for table action columns. */ icon?: boolean;
  /** Another row shares this one's amount and date: ask first, and delete only this one. */ confirmOnly?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { notify } = useQuickEntry();
  const [pending, start] = useTransition();

  const run = () => {
    if (confirmOnly && !window.confirm(t("deleted.onlyThis"))) return;
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
    });
  };

  if (icon) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={run}
        aria-label={label ?? t("common.delete")}
        title={label ?? t("common.delete")}
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-plum-soft transition-colors hover:bg-berry-tint hover:text-berry disabled:opacity-50",
          className,
        )}
      >
        <TrashIcon className="h-5 w-5" />
      </button>
    );
  }
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={pending}
      onClick={run}
    >
      {label ?? t("common.delete")}
    </Button>
  );
}
