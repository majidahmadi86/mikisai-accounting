"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshInsights } from "@/app/(app)/insights/actions";
import { Button } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n/client";

export function RefreshButton() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await refreshInsights();
          router.refresh();
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        })
      }
    >
      <RefreshIcon className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {done ? t("insights.refreshed") : t("insights.refresh")}
    </Button>
  );
}
