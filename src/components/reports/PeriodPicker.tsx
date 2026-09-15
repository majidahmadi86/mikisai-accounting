"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import type { Period } from "@/lib/reports/period";
import { cn } from "@/lib/cn";

const chip = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors";

export function PeriodPicker({ period, basePath = "/reports" }: { period: Period; basePath?: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(period.key === "custom");
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  function go(qs: string) {
    start(() => router.push(`${basePath}?${qs}`));
  }

  return (
    <div className="rounded-card border border-line bg-card px-4 py-4 sm:px-5">
      <p className="eyebrow mb-2">{t("reports.period")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setCustom(false); go("period=week"); }} className={cn(chip, period.key === "week" ? "border-plum bg-plum text-ivory" : "border-line text-plum-soft hover:border-plum-faint")}>
          {t("reports.thisWeek")}
        </button>
        <button type="button" onClick={() => { setCustom(false); go("period=month"); }} className={cn(chip, period.key === "month" ? "border-plum bg-plum text-ivory" : "border-line text-plum-soft hover:border-plum-faint")}>
          {t("reports.thisMonth")}
        </button>
        <button type="button" onClick={() => setCustom(true)} className={cn(chip, period.key === "custom" || custom ? "border-plum bg-plum text-ivory" : "border-line text-plum-soft hover:border-plum-faint")}>
          {t("reports.custom")}
        </button>
      </div>
      {custom ? (
        <form
          className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) go(`period=custom&from=${from}&to=${to}`);
          }}
        >
          <label className="block">
            <span className="eyebrow mb-1 block">{t("reports.from")}</span>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t("reports.to")}</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <Button type="submit" variant="secondary" disabled={pending}>
            {t("reports.apply")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
