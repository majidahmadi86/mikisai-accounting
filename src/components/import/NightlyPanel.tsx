"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitImport, mapSku, type CommitResult } from "@/app/(app)/import/actions";
import { MappingPanel } from "./MappingPanel";
import { ReviewTable } from "./ReviewTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useLocale, useT } from "@/lib/i18n/client";
import type { NightlyPayout, NightlyReview } from "@/lib/import/nightly";
import type { ColumnMapping } from "@/lib/import/tiktok";
import type { Product } from "@/lib/inventory/valuation";
import { shortProductName } from "@/lib/inventory/units";
import { formatDate, thb } from "@/lib/money";
import type { ReviewRow } from "@/lib/parse/schema";
import type { Person, PlatformSetting } from "@/lib/types";
import { cn } from "@/lib/cn";
import { SELLER_CENTER_FINANCE, SELLER_CENTER_ORDERS } from "@/lib/import/links";

const ACCEPT = ".csv,.xlsx,.xls,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Phase = { name: "idle" } | { name: "reading" } | { name: "review"; result: NightlyReview } | { name: "done"; result: Extract<CommitResult, { ok: true }> };

function DropZone({ id, title, hint, href, linkLabel, disabled, onFiles }: { id: string; title: string; hint: string; href: string; linkLabel: string; disabled: boolean; onFiles: (files: File[]) => void }) {
  const t = useT();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn("flex min-h-44 flex-col justify-between rounded-2xl border-2 border-dashed px-5 py-4 transition-colors", over ? "border-berry bg-berry-tint/40" : "border-line bg-ivory-deep/40")}
    >
      <div>
        <p className="font-display text-xl text-plum">{title}</p>
        <p className="mt-1 text-sm text-plum-soft">{hint}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
          {t("nightly.choose")}
        </Button>
        <a href={href} target="_blank" rel="noreferrer" className="text-sm font-medium text-berry hover:underline">
          {linkLabel} ↗
        </a>
        <input
          ref={input}
          id={id}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/**
 * The nightly TikTok routine: drop the Orders and Finance exports, look at
 * one review, confirm once. The server reads both files through the same plan
 * the API sync uses, so what is ready is saved as it is and only the rows the
 * auto-confirm rule would not take ask for attention.
 */
export function NightlyPanel({ settings, products, admin, defaultReceivedBy }: { settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[]; products: Product[]; admin: boolean; defaultReceivedBy: Person }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [files, setFiles] = useState<File[]>([]);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [ready, setReady] = useState<ReviewRow[]>([]);
  const [payouts, setPayouts] = useState<NightlyPayout[]>([]);
  const [showReady, setShowReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const productName = (id: string | null) => {
    const p = products.find((x) => x.id === id);
    return p ? shortProductName(p, locale) : t("import.unmatched");
  };

  async function read(list: File[], mapping?: { orders?: ColumnMapping; finance?: ColumnMapping }) {
    if (!list.length) return;
    setError(null);
    setPhase({ name: "reading" });
    const fd = new FormData();
    fd.set("received_by", defaultReceivedBy);
    if (mapping?.orders) fd.set("mapping_orders", JSON.stringify(mapping.orders));
    if (mapping?.finance) fd.set("mapping_finance", JSON.stringify(mapping.finance));
    list.forEach((f) => fd.append("files", f));
    try {
      const res = await fetch("/api/import-nightly", { method: "POST", body: fd });
      if (!res.ok) throw new Error(String(res.status));
      const result = (await res.json()) as NightlyReview;
      setReady(result.ready);
      setReview(result.review);
      setPayouts(result.payouts);
      setPhase({ name: "review", result });
    } catch {
      setError(t("import.errorTable"));
      setPhase({ name: "idle" });
    }
  }

  function add(more: File[]) {
    const next = [...files, ...more.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))].slice(0, 12);
    setFiles(next);
    void read(next);
  }

  function reset() {
    setFiles([]);
    setReady([]);
    setReview([]);
    setPayouts([]);
    setError(null);
    setPhase({ name: "idle" });
  }

  function confirm(result: NightlyReview) {
    const chosen = [...ready.filter((r) => r.include), ...review.filter((r) => r.include)];
    if (chosen.some((r) => !r.quantity || r.quantity < 1)) return setError(t("import.needQty"));
    if (chosen.some((r) => !r.product_id)) return setError(t("import.needProducts"));
    setError(null);
    startSaving(async () => {
      const outcome = await commitImport({
        source: "csv",
        upload_ids: result.upload_ids,
        skipped: result.skipped,
        rows: chosen.map((r) => ({ date: r.date, platform: r.platform, product_line: r.product_line, gross_amount: r.gross_amount ?? r.net_amount ?? 0, net_amount: r.net_amount ?? 0, received_by: r.received_by, status: r.status, customer_name: r.customer_name, order_id: r.order_id, note: r.note, product_id: r.product_id as string, quantity: r.quantity ?? 1, tags: [], order_status: r.order_status ?? "active", refund_amount: r.refund_amount ?? null })),
        status_changes: result.status_changes.map(({ transaction_id, order_status, date, refund_amount }) => ({ transaction_id, order_status, date, refund_amount })),
        payouts: payouts.filter((p) => p.include).map((p) => ({ date: p.date, platform: p.platform, amount: p.amount, received_by: p.received_by, note: p.note, external_ref: p.external_ref, allocations: p.allocations })),
        details: { nightly: true, files: result.files.map((f) => ({ name: f.name, type: f.file_type, rows: f.rows })), missing_status: result.missing_status.length, unmapped_skus: result.unmapped_skus.length },
      });
      if (!outcome.ok) return setError(t("common.error"));
      setPhase({ name: "done", result: outcome });
      router.refresh();
    });
  }

  if (phase.name === "done") {
    const r = phase.result;
    return (
      <Card tone="success" className="mb-4 p-6">
        <p className="eyebrow">{t("nightly.eyebrow")}</p>
        <p className="mt-1 font-display text-2xl text-berry">{t("import.doneTitle")}</p>
        <p className="mt-2 text-sm text-plum">{t("import.doneSummary", { orders: r.inserted, cancellations: r.cancellations, payouts: r.payouts, skipped: r.skipped })}</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={reset}>
          {t("import.startOver")}
        </Button>
      </Card>
    );
  }

  if (phase.name === "review") {
    const result = phase.result;
    const counts = { ready: ready.filter((r) => r.include).length, review: review.filter((r) => r.include).length, changes: result.status_changes.length, payouts: payouts.filter((p) => p.include).length };
    const total = counts.ready + counts.review + counts.changes + counts.payouts;
    const typed = (type: "orders" | "finance") => result.files.find((f) => f.file_type === type && f.headers.length);
    return (
      <div className="mb-4 space-y-4">
        <Card className="px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{t("nightly.eyebrow")}</p>
              <p className="mt-1 font-display text-2xl text-plum">{t("nightly.reviewTitle")}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                <li><Pill tone="success">{t("nightly.countReady", { n: counts.ready })}</Pill></li>
                <li><Pill tone={review.length ? "warning" : "neutral"}>{t("nightly.countReview", { n: review.length })}</Pill></li>
                <li><Pill tone={counts.changes ? "berry-soft" : "neutral"}>{t("nightly.countChanges", { n: counts.changes })}</Pill></li>
                <li><Pill tone={payouts.length ? "lavender" : "neutral"}>{t("nightly.countPayouts", { n: payouts.length })}</Pill></li>
                <li><Pill tone="neutral">{t("nightly.countSkipped", { n: result.skipped + result.known_payments })}</Pill></li>
              </ul>
              <p className="mt-2 text-xs text-plum-faint">{result.files.map((f) => `${f.name} · ${f.error ? t(`nightly.fileError.${f.error}`) : `${t(`import.fileType.${f.file_type as "orders"}`)}, ${f.rows}`}`).join("  |  ")}</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="button" variant="ghost" onClick={reset}>
                {t("import.startOver")}
              </Button>
              <Button type="button" className="flex-1 sm:flex-none" disabled={saving || total === 0} onClick={() => confirm(result)}>
                {total === 0 ? t("nightly.nothingNew") : t("import.confirmAll", { n: total })}
              </Button>
            </div>
          </div>
          {result.missing_status.length ? <p className="mt-3 rounded-xl bg-warning-tint px-3 py-2 text-xs text-warning-ink">{t("nightly.missingStatus", { n: result.missing_status.length, refs: result.missing_status.slice(0, 5).join(", ") })}</p> : null}
          {result.warnings.length ? <p className="mt-2 rounded-xl bg-warning-tint px-3 py-2 text-xs text-warning-ink">{result.warnings.join(" ")}</p> : null}
          {error ? <p className="mt-3 text-sm text-berry">{error}</p> : null}
        </Card>

        {(["orders", "finance"] as const).map((type) => {
          const f = typed(type);
          return f ? <MappingPanel key={type} fileType={type} headers={f.headers} mapping={f.mapping} admin={admin} onReread={(m) => void read(files, { [type]: m })} /> : null;
        })}

        {result.unmapped_skus.length ? (
          <Card className="px-5 py-4">
            <p className="font-display text-lg text-plum">{t("nightly.skusTitle", { n: result.unmapped_skus.length })}</p>
            <p className="text-xs text-plum-soft">{t("nightly.skusHint")}</p>
            <ul className="mt-3 space-y-2">
              {result.unmapped_skus.map((s) => (
                <li key={s.sku_key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-plum">{s.sku_name || s.sku_key}</span>
                  <select
                    aria-label={t("nightly.skuPick")}
                    defaultValue=""
                    onChange={(e) => {
                      const productId = e.target.value;
                      if (!productId) return;
                      startSaving(async () => {
                        await mapSku(s.sku_key, productId);
                        await read(files);
                      });
                    }}
                    className="min-h-9 rounded-lg border border-line bg-card px-2 text-sm text-plum"
                  >
                    <option value="">{t("nightly.skuPick")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {shortProductName(p, locale)}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {result.status_changes.length ? (
          <Card className="px-5 py-4">
            <p className="font-display text-lg text-plum">{t("nightly.changesTitle", { n: result.status_changes.length })}</p>
            <p className="text-xs text-plum-soft">{t("nightly.changesHint")}</p>
            <ul className="mt-2 divide-y divide-line text-sm">
              {result.status_changes.map((c) => (
                <li key={c.transaction_id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-mono text-xs text-plum">#{c.order_ref}</span>
                  <Pill tone="berry-soft">{c.order_status === "cancelled" ? t("orders.cancelled") : t("orders.refunded", { amount: thb(c.refund_amount ?? 0) })}</Pill>
                  <span className="text-xs text-plum-faint">{formatDate(c.date, locale)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {payouts.length ? (
          <Card className="px-5 py-4">
            <p className="font-display text-lg text-plum">{t("import.payoutsTitle", { n: payouts.length })}</p>
            <p className="text-xs text-plum-soft">{t("nightly.payoutsHint")}</p>
            <ul className="mt-2 divide-y divide-line text-sm">
              {payouts.map((p) => (
                <li key={p.key} className={cn("flex flex-wrap items-center gap-3 py-2", !p.include && "opacity-60")}>
                  <label className="flex min-h-9 items-center gap-2 font-medium text-plum">
                    <input type="checkbox" checked={p.include} onChange={(e) => setPayouts(payouts.map((x) => (x.key === p.key ? { ...x, include: e.target.checked } : x)))} className="h-5 w-5 accent-[#8f315f]" aria-label={t("import.include")} />
                    <span className="tabular">{thb(p.amount)}</span>
                  </label>
                  <span className="text-xs text-plum-faint">{formatDate(p.date, locale)}</span>
                  <span className="font-mono text-xs text-plum-faint">{p.external_ref}</span>
                  <Pill tone={p.covered_orders === p.orders && Math.abs(p.covered_amount - p.amount) <= Math.max(0.05, p.amount * 0.02) ? "success" : "warning"}>{t("nightly.payoutCovers", { covered: p.covered_orders, orders: p.orders, amount: thb(p.covered_amount) })}</Pill>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {review.length ? (
          <div>
            <p className="mb-2 font-display text-lg text-plum">{t("nightly.reviewRows", { n: review.length })}</p>
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {Array.from(new Set((result.review ?? []).flatMap((r) => r.reasons))).map((reason) => (
                <li key={reason}>
                  <Pill tone="warning">{t(`tiktok.reason.${reason}`)}</Pill>
                </li>
              ))}
            </ul>
            <ReviewTable rows={review} onChange={setReview} settings={settings} products={products} />
          </div>
        ) : null}

        {ready.length ? (
          <Card className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-lg text-plum">{t("nightly.readyRows", { n: ready.length })}</p>
              <button type="button" onClick={() => setShowReady((v) => !v)} className="min-h-9 text-xs font-medium text-berry hover:underline">
                {showReady ? t("nightly.hideReady") : t("nightly.showReady")}
              </button>
            </div>
            <p className="text-xs text-plum-soft">{t("nightly.readyHint")}</p>
            {showReady ? (
              <div className="mt-3 max-w-full overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-plum-faint">
                      <th className="py-1 pr-3"></th>
                      <th className="py-1 pr-3">{t("transactions.orderRef")}</th>
                      <th className="py-1 pr-3">{t("common.date")}</th>
                      <th className="py-1 pr-3">{t("import.product")}</th>
                      <th className="py-1 pr-3 text-right">{t("import.qty")}</th>
                      <th className="py-1 pr-3 text-right">{t("common.gross")}</th>
                      <th className="py-1 text-right">{t("common.net")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ready.map((r) => (
                      <tr key={r.key} className={cn("border-t border-line/60", !r.include && "opacity-50")}>
                        <td className="py-1.5 pr-3">
                          <input type="checkbox" checked={r.include} onChange={(e) => setReady(ready.map((x) => (x.key === r.key ? { ...x, include: e.target.checked } : x)))} className="h-4 w-4 accent-[#8f315f]" aria-label={t("import.include")} />
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-xs">#{r.order_id}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{r.date ? formatDate(r.date, locale) : ""}</td>
                        <td className="py-1.5 pr-3">{productName(r.product_id)}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{r.quantity}</td>
                        <td className="py-1.5 pr-3 text-right tabular text-plum-faint">{thb(r.gross_amount ?? 0)}</td>
                        <td className="py-1.5 text-right tabular font-medium text-berry">{thb(r.net_amount ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>
    );
  }

  const reading = phase.name === "reading";
  return (
    <Card className="mb-4 p-5 sm:p-6">
      <p className="eyebrow">{t("nightly.eyebrow")}</p>
      <p className="mt-1 font-display text-2xl text-plum">{t("nightly.title")}</p>
      <p className="text-sm text-plum-soft">{t("nightly.subtitle")}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <DropZone id="nightly-orders" title={t("nightly.ordersTitle")} hint={t("nightly.ordersHint")} href={SELLER_CENTER_ORDERS} linkLabel={t("nightly.ordersLink")} disabled={reading} onFiles={add} />
        <DropZone id="nightly-finance" title={t("nightly.financeTitle")} hint={t("nightly.financeHint")} href={SELLER_CENTER_FINANCE} linkLabel={t("nightly.financeLink")} disabled={reading} onFiles={add} />
      </div>
      <p className="mt-3 text-xs text-plum-faint">{t("nightly.anyZone")}</p>
      {reading ? <p className="mt-3 text-sm text-plum-soft">{t("import.readingTable")}…</p> : null}
      {error ? <p className="mt-3 text-sm text-berry">{error}</p> : null}
    </Card>
  );
}
