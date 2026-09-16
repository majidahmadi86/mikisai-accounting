"use client";

import { useState } from "react";
import { Chips } from "@/components/ui/Chips";
import { useT } from "@/lib/i18n/client";
import type { TransferKind } from "@/lib/types";

/** Settlement or Capital, as two chips with a hidden input for the server action. */
export function KindChips({ defaultValue = "settlement", name = "kind" }: { defaultValue?: TransferKind; name?: string }) {
  const t = useT();
  const [kind, setKind] = useState<TransferKind>(defaultValue);
  return (
    <Chips
      name={name}
      label={t("transfer.kind")}
      value={kind}
      onChange={setKind}
      options={[
        { value: "settlement", label: t("transfer.kindSettlement") },
        { value: "capital", label: t("transfer.kindCapital") },
      ]}
    />
  );
}
