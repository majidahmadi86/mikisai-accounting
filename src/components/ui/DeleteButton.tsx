"use client";

import { useT } from "@/lib/i18n/client";
import { Button, type ButtonVariant } from "./Button";

/** Submits its enclosing form only after the user confirms. */
export function DeleteButton({ label, variant = "danger", className }: { label?: string; variant?: ButtonVariant; className?: string }) {
  const t = useT();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      onClick={(e) => {
        if (!window.confirm(t("common.deleteConfirm"))) e.preventDefault();
      }}
    >
      {label ?? t("common.delete")}
    </Button>
  );
}
