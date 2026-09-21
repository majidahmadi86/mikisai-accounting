"use client";

import { InfoTip } from "@/components/ui/InfoTip";
import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { commitImport, type CommitResult } from "@/app/(app)/import/actions";
import { PayoutRows } from "./PayoutRows";
import { ReviewTable } from "./ReviewTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import { platformName } from "@/lib/labels";
import type { ParseResponse, PayoutRow, ReviewRow } from "@/lib/parse/schema";
import { takeSharedFiles } from "@/lib/pwa/shared-files";
import { PEOPLE, PLATFORMS, type Person, type Platform, type PlatformSetting } from "@/lib/types";
import type { Product } from "@/lib/inventory/valuation";

type Phase = { name: "idle" } | { name: "parsing"; what: "screens" } | { name: "review"; result: ParseResponse; source: "csv" | "screenshots" } | { name: "done"; result: Extract<CommitResult, { ok: true }> };

export const MAX_FILES = 12;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Three ways in, one review, one confirm: a Seller Center export (the
 * nightly desktop path), screenshots shared or picked from the phone, or
 * pasted text. Every row shows what the import assumed in gold.
 */
export function ImportWorkbench({ settings, defaultReceivedBy, products }: { settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[]; defaultReceivedBy: Person; products: Product[] }) {
  const t = useT();
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [receivedBy, setReceivedBy] = useState<Person>(defaultReceivedBy);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [sharedNote, setSharedNote] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const autoRan = useRef(false);

  // Screenshots shared from the TikTok Seller app land here with ?shared=1: take them from the worker's cache and read them at once.
  const shared = params.get("shared");
  useEffect(() => {
    if (!shared || autoRan.current) return;
    autoRan.current = true;
    void receiveShared(shared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  async function receiveShared(kind: string) {
    if (kind === "missed") {
      setSharedNote(t("import.sharedMissed"));
      return;
    }
    const list = await takeSharedFiles();
    if (!list.length) {
      setSharedNote(t("import.sharedNone"));
      return;
    }
    const usable = list.filter((f) => f.size <= MAX_FILE_BYTES).slice(0, MAX_FILES);
    setFiles(usable);
    setSharedNote(t("import.sharedReceived", { n: usable.length }));
    await parseScreens(usable);
  }

  async function parseScreens(list: File[] = files) {
    setError(null);
    if (!text.trim() && list.length === 0) {
      setError(t("import.needInput"));
      return;
    }
    const fd = new FormData();
    fd.set("platform", platform);
    fd.set("received_by", receivedBy);
    fd.set("text", text);
    list.forEach((f) => fd.append("files", f));
    setPhase({ name: "parsing", what: "screens" });
    try {
      const res = await fetch("/api/parse-report", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const result = (await res.json()) as ParseResponse;
      setRows(result.rows);
      setPayouts(result.payouts ?? []);
      setPhase({ name: "review", result, source: "screenshots" });
    } catch {
      setError(t("import.errorParse"));
      setPhase({ name: "idle" });
    }
  }

  function confirm(result: ParseResponse, source: "csv" | "screenshots") {
    const selected = rows.filter((r) => r.include);
    const fresh = selected.filter((r) => !r.existing);
    const changes = selected.filter((r) => r.existing && r.tags.includes("status_change"));
    const chosenPayouts = payouts.filter((p) => p.include);
    if (!fresh.length && !changes.length && !chosenPayouts.length) return;
    if (fresh.some((r) => !r.quantity || r.quantity < 1)) return setError(t("import.needQty"));
    if (fresh.some((r) => !r.product_id)) return setError(t("import.needProducts"));
    setError(null);
    startSaving(async () => {
      const outcome: CommitResult = await commitImport({
        source,
        upload_ids: result.upload_ids,
        skipped: rows.filter((r) => r.tags.includes("already_recorded")).length,
        rows: fresh.map((r) => ({
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
          tags: r.tags.filter((tag): tag is "date_assumed" | "qty_inferred" => tag === "date_assumed" || tag === "qty_inferred"),
          order_status: r.order_status ?? "active",
        })),
        status_changes: changes.map((r) => ({ transaction_id: r.existing!.id, order_status: r.order_status === "refunded" ? "refunded" : "cancelled", date: r.date ?? new Date().toISOString().slice(0, 10), refund_amount: r.order_status === "refunded" ? r.net_amount : null })),
        payouts: chosenPayouts.map((p) => ({ date: p.date, platform: p.platform, amount: p.amount, received_by: p.received_by, note: p.note })),
      });
      if (outcome.ok) setPhase({ name: "done", result: outcome });
      else setError(t("common.error"));
    });
  }

  function reset() {
    setPhase({ name: "idle" });
    setRows([]);
    setPayouts([]);
    setText("");
    setFiles([]);
    setError(null);
  }

  if (phase.name === "done") {
    const r = phase.result;
    return (
      <Card tone="success" className="p-6">
        <p className="font-display text-2xl text-berry">{t("import.doneTitle")}</p>
        <p className="mt-2 text-sm text-plum">{t("import.doneSummary", { orders: r.inserted, cancellations: r.cancellations, payouts: r.payouts, skipped: r.skipped })}</p>
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" onClick={reset}>
            {t("import.startOver")}
          </Button>
        </div>
      </Card>
    );
  }

  if (phase.name === "review") {
    const included = rows.filter((r) => r.include);
    const fresh = included.filter((r) => !r.existing).length;
    const changes = included.filter((r) => r.existing && r.tags.includes("status_change")).length;
    const dupes = rows.filter((r) => r.tags.includes("already_recorded")).length;
    const chosenPayouts = payouts.filter((p) => p.include).length;
    const nothing = fresh + changes + chosenPayouts === 0;
    return (
      <div className="space-y-4">
        <Card className="px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl text-plum">{t("import.reviewTitle")}</p>
              <InfoTip text={t("import.reviewSubtitle")} align="left" />
              <p className="mt-1 text-xs text-plum-faint">{t("import.reviewCounts", { fresh, changes, dupes, payouts: chosenPayouts })}</p>
              <InfoTip text={t("import.reviewHint")} align="left" />
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="button" variant="ghost" onClick={reset}>
                {t("import.startOver")}
              </Button>
              <Button type="button" className="flex-1 sm:flex-none" disabled={saving || nothing} onClick={() => confirm(phase.result, phase.source)}>
                {t("import.confirmAll", { n: fresh + changes + chosenPayouts })}
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
        <PayoutRows rows={payouts} onChange={setPayouts} />
        {rows.length === 0 && payouts.length === 0 ? <Card className="p-6 text-sm text-plum-soft">{t("import.noRows")}</Card> : null}
        {rows.length ? <ReviewTable rows={rows} onChange={setRows} settings={settings} products={products} /> : null}
      </div>
    );
  }

  const parsing = phase.name === "parsing";
  return (
    <div className="space-y-4">
      {sharedNote ? <p className="rounded-xl bg-lavender-tint px-4 py-3 text-sm text-plum">{sharedNote}</p> : null}
      <Card className="p-5 sm:p-6">
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
      </Card>

      <Card className="p-5 sm:p-6">
        <p className="eyebrow">{t("import.screensEyebrow")}</p>
        <p className="mt-1 flex items-center gap-2 font-display text-xl text-plum">
          {t("import.screensTitle")} <InfoTip text={t("import.screensHint")} align="left" />
        </p>
        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
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
            <Textarea id="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("import.pastePlaceholder")} className="min-h-40 font-mono text-xs" disabled={parsing} />
          </Field>
        </div>
        {error ? <p className="mt-4 text-sm text-berry">{error}</p> : null}
        <div className="mt-5 flex items-center gap-3">
          <Button type="button" onClick={() => void parseScreens()} disabled={parsing}>
            {parsing && phase.what === "screens" ? `${t("import.parsing")}…` : t("import.parse")}
          </Button>
          {parsing ? <span className="h-2 w-2 animate-pulse rounded-full bg-berry" aria-hidden="true" /> : null}
        </div>
      </Card>
    </div>
  );
}
