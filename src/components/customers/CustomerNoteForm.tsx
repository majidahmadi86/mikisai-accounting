"use client";

import { useState, useTransition } from "react";
import { saveCustomerNote } from "@/app/(app)/customers/actions";
import { controlClass } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

export function CustomerNoteForm({ id, note }: { id: string; note: string }) {
  const t = useT();
  const [value, setValue] = useState(note);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = value !== note;

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("note", value);
        startTransition(async () => {
          await saveCustomerNote(id, fd);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        });
      }}
    >
      <input
        className={cn(controlClass, "min-h-10 py-1.5")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("customers.notePlaceholder")}
        aria-label={t("common.note")}
      />
      <button type="submit" disabled={!dirty || pending} className="min-h-10 px-2 text-xs font-medium text-berry disabled:text-plum-faint whitespace-nowrap">
        {saved ? t("common.saved") : t("common.save")}
      </button>
    </form>
  );
}
