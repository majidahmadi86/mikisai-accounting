"use client";

import { useState, useTransition } from "react";
import { saveImportMapping } from "@/app/(app)/import/actions";
import { Button } from "@/components/ui/Button";
import { FIELD_KEYS, type ColumnMapping, type FieldKey } from "@/lib/import/tiktok";
import { useT } from "@/lib/i18n/client";

const ORDER_FIELDS: FieldKey[] = ["order_id", "order_status", "cancel_type", "created_at", "paid_at", "delivered_at", "cancelled_at", "sku_name", "variant", "quantity", "unit_price", "subtotal", "order_amount", "refund_amount", "buyer_name"];
const FINANCE_FIELDS: FieldKey[] = ["order_id", "statement_type", "created_at", "settled_at", "seller_received", "refund_amount", "statement_status"];

/**
 * How the file's columns were read, field by field. TikTok renames headers
 * now and then; the admin fixes a field once, saves, and the next export
 * reads the same way. Re-read applies the change to the file just uploaded.
 */
export function MappingPanel({ fileType, headers, mapping, admin, onReread }: { fileType: "orders" | "finance"; headers: string[]; mapping: Record<string, string>; admin: boolean; onReread: (mapping: ColumnMapping) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ColumnMapping>(() => Object.fromEntries(Object.entries(mapping).filter(([k]) => (FIELD_KEYS as readonly string[]).includes(k))) as ColumnMapping);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fields = fileType === "orders" ? ORDER_FIELDS : FINANCE_FIELDS;
  const mapped = fields.filter((f) => draft[f]).length;

  return (
    <div className="rounded-card border border-line bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-plum">
          <span className="font-medium">{t(`import.fileType.${fileType}`)}</span> · {t("import.columnsRead", { n: mapped, total: fields.length })}
        </p>
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-h-9 text-xs font-medium text-berry hover:underline">
          {open ? t("import.hideColumns") : t("import.showColumns")}
        </button>
      </div>
      {open ? (
        <div className="mt-3">
          <p className="mb-2 text-xs text-plum-soft">{admin ? t("import.columnsHintAdmin") : t("import.columnsHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f} className="block text-xs text-plum">
                <span className="eyebrow mb-1 block">{t(`import.field.${f}`)}</span>
                <select
                  value={draft[f] ?? ""}
                  disabled={!admin}
                  onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value || undefined }))}
                  className="min-h-9 w-full rounded-lg border border-line bg-card px-2 text-sm text-plum focus:border-berry focus:outline-none disabled:opacity-70"
                >
                  <option value="">{t("import.columnNone")}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {admin ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => onReread(draft)}>
                {t("import.reread")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => v)) as Record<FieldKey, string>;
                    const r = await saveImportMapping({ file_type: fileType, mapping: clean });
                    setSaved(r.ok ? t("import.mappingSaved") : t("common.error"));
                  })
                }
              >
                {t("import.saveMapping")}
              </Button>
              {saved ? <span className="text-xs text-plum-soft">{saved}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
