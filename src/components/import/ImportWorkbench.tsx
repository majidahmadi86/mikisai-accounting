"use client";

import { useState, useTransition } from "react";
import { commitImport, type CommitResult } from "@/app/(app)/import/actions";
import { ReviewTable } from "./ReviewTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import { platformName } from "@/lib/labels";
import type { ParseResponse, ReviewRow } from "@/lib/parse/schema";
import { PEOPLE, PLATFORMS, type Person, type Platform, type PlatformSetting } from "@/lib/types";
import type { Product } from "@/lib/inventory/valuation";

type Phase = { name: "idle" } | { name: "parsing" } | { name: "review"; result: ParseResponse } | { name: "done"; inserted: number };

export const MAX_FILES = 12;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function ImportWorkbench({ settings, defaultReceivedBy, products }: { settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[]; defaultReceivedBy: Person; products: Product[] }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [receivedBy, setReceivedBy] = useState<Person>(defaultReceivedBy);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, startSaving] = useTransition();

  async function parse() {
    setError(null);
    if (!text.trim() && files.length === 0) {
      setError(t("import.needInput"));
      return;
    }
    const fd = new FormData();
    fd.set("platform", platform);
    fd.set("received_by", receivedBy);
    fd.set("text", text);
    files.forEach((f) => fd.append("files", f));

    setPhase({ name: "parsing" });
    try {
      const res = await fetch("/api/parse-report", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const result = (await res.json()) as ParseResponse;
      setRows(result.rows);
      setPhase({ name: "review", result });
    } catch {
      setError(t("import.errorParse"));
      setPhase({ name: "idle" });
    }
  }

  function confirm(uploadIds: string[]) {
    const selected = rows.filter((r) => r.include);
    if (!selected.length) return;
    if (selected.some((r) => !r.product_id || !r.quantity || r.quantity < 1)) {
      setError(t("import.needProducts"));
      return;
    }
    setError(null);
    startSaving(async () => {
      const result: CommitResult = await commitImport({
        upload_ids: uploadIds,
        rows: selected.map((r) => ({
          date: r.date,
          platform: r.platform,
          product_line: r.product_line,
          gross_amount: r.gross_amount ?? r.net_amount ?? 0,
          net_amount: r.net_amount ?? 0,
          received_by: r.received_by,
          status: r.status,
          customer_name: r.customer_name,
          order_id: r.order_id,
          note: r.note,
          product_id: r.product_id as string,
          quantity: r.quantity ?? 1,
        })),
      });
      if (result.ok) setPhase({ name: "done", inserted: result.inserted });
      else setError(t("common.error"));
    });
  }

  function reset() {
    setPhase({ name: "idle" });
    setRows([]);
    setText("");
    setFiles([]);
    setError(null);
  }

  if (phase.name === "done") {
    return (
      <Card tone="success" className="p-6">
        <p className="font-display text-2xl text-berry">{t("import.confirmed", { n: phase.inserted })}</p>
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" onClick={reset}>
            {t("import.startOver")}
          </Button>
        </div>
      </Card>
    );
  }

  if (phase.name === "review") {
    const includedCount = rows.filter((r) => r.include).length;
    return (
      <div className="space-y-4">
        <Card className="px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl text-plum">{t("import.reviewTitle")}</p>
              <p className="text-sm text-plum-soft">{t("import.reviewSubtitle")}</p>
              <p className="mt-1 text-xs text-plum-faint">{t("import.batches", { orders: rows.length, batches: phase.result.batches })}</p>
              <p className="mt-1 text-xs text-plum-soft">{t("import.reviewHint")}</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="button" variant="ghost" onClick={reset}>
                {t("import.startOver")}
              </Button>
              <Button type="button" className="flex-1 sm:flex-none" disabled={saving || includedCount === 0} onClick={() => confirm(phase.result.upload_ids)}>
                {t("import.confirm", { n: includedCount })}
              </Button>
            </div>
          </div>
          {phase.result.warnings.length ? (
            <div className="mt-3 rounded-xl bg-warning-tint px-3 py-2 text-xs text-warning-ink">
              <p className="font-medium">{t("import.warnings")}</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {phase.result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-berry">{error}</p> : null}
        </Card>
        {rows.length === 0 ? <Card className="p-6 text-sm text-plum-soft">{t("import.noRows")}</Card> : <ReviewTable rows={rows} onChange={setRows} settings={settings} products={products} />}
      </div>
    );
  }

  const parsing = phase.name === "parsing";
  return (
    <Card className="p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("import.platformLabel")} htmlFor="platform">
              <Select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} disabled={parsing}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {platformName(t, p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("import.defaultReceivedBy")} htmlFor="received_by">
              <Select id="received_by" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value as Person)} disabled={parsing}>
                {PEOPLE.map((p) => (
                  <option key={p} value={p}>
                    {t(`common.${p}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("import.filesLabel")} htmlFor="files" hint={t("import.filesHint")}>
            <Input
              id="files"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              disabled={parsing}
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []).filter((f) => f.size <= MAX_FILE_BYTES).slice(0, MAX_FILES);
                setFiles(list);
              }}
            />
          </Field>
          {files.length ? (
            <ul className="text-xs text-plum-soft space-y-0.5">
              {files.map((f) => (
                <li key={`${f.name}-${f.size}`}>
                  {f.name} · {(f.size / 1024).toFixed(0)} KB
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Field label={t("import.pasteLabel")} htmlFor="text">
          <Textarea id="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("import.pastePlaceholder")} className="min-h-56 font-mono text-xs" disabled={parsing} />
        </Field>
      </div>
      {error ? <p className="mt-4 text-sm text-berry">{error}</p> : null}
      <div className="mt-5 flex items-center gap-3">
        <Button type="button" onClick={parse} disabled={parsing}>
          {parsing ? `${t("import.parsing")}…` : t("import.parse")}
        </Button>
        {parsing ? <span className="h-2 w-2 animate-pulse rounded-full bg-berry" aria-hidden="true" /> : null}
      </div>
    </Card>
  );
}
