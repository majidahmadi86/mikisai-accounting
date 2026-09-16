"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { restore, type SoftDeleteEntity } from "@/app/(app)/deleted/actions";
import { useQuickEntry } from "@/components/quick-entry/QuickEntryProvider";
import { useT } from "@/lib/i18n/client";
import { Button } from "./Button";

export function RestoreButton({ entity, id }: { entity: SoftDeleteEntity; id: string }) {
  const t = useT();
  const router = useRouter();
  const { notify } = useQuickEntry();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await restore(entity, id);
          notify({ message: r.ok ? t("deleted.restored") : t("roles.denied") });
          router.refresh();
        })
      }
    >
      {t("deleted.restore")}
    </Button>
  );
}
