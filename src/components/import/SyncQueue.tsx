"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitImport, dismissQueued } from "@/app/(app)/import/actions";
import { ReviewTable } from "./ReviewTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useT } from "@/lib/i18n/client";
import type { Product } from "@/lib/inventory/valuation";
import type { ReviewRow } from "@/lib/parse/schema";
import type { PlatformSetting } from "@/lib/types";

export type QueuedOrder = { id: string; order_ref: string; reasons: string[]; row: ReviewRow };

/**
 * Orders the TikTok sync could not settle by itself (no settlement yet, a
 * product it could not match, more than one product) wait here in the same
 * review table as every other import. Confirm saves them; the sync upgrades
 * and confirms them on its own once TikTok reports the settlement.
 */
export function SyncQueue({ queued, settings, products }: { queued: QueuedOrder[]; settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[]; products: Product[] }) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState<ReviewRow[]>(() => queued.map((q) => ({ ...q.row, key: q.id, include: true })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!queued.length) return null;
  const reasonsOf = new Map(queued.map((q) => [q.id, q.reasons]));
  const chosen = rows.filter((r) => r.include);

  function confirm() {
    if (chosen.some((r) => !r.quantity || r.quantity < 1)) return setError(t("import.needQty"));
    if (chosen.some((r) => !r.product_id)) return setError(t("import.needProducts"));
    setError(null);
    start(async () => {
      const result = await commitImport({
        source: "tiktok",
        upload_ids: [],
        queue_ids: chosen.map((r) => r.key),
        rows: chosen.map((r) => ({ date: r.date, platform: r.platform, product_line: r.product_line, gross_amount: r.gross_amount ?? r.net_amount ?? 0, net_amount: r.net_amount ?? 0, received_by: r.received_by, status: r.status, customer_name: r.customer_name, order_id: r.order_id, note: r.note, product_id: r.product_id as string, quantity: r.quantity ?? 1, tags: [], order_status: r.order_status ?? "active", refund_amount: r.refund_amount ?? null })),
      });
      if (!result.ok) return setError(t("common.error"));
      router.refresh();
    });
  }

  return (
    <Card className="mb-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{t("tiktok.queueEyebrow")}</p>
          <p className="mt-1 font-display text-xl text-plum">{t("tiktok.queueTitle", { n: queued.length })}</p>
          <p className="text-sm text-plum-soft">{t("tiktok.queueHint")}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" disabled={pending || !chosen.length} onClick={() => start(async () => void (await dismissQueued(chosen.map((r) => r.key)), router.refresh()))}>
            {t("tiktok.queueDismiss")}
          </Button>
          <Button type="button" disabled={pending || !chosen.length} onClick={confirm}>
            {t("import.confirmAll", { n: chosen.length })}
          </Button>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {Array.from(new Set(rows.flatMap((r) => reasonsOf.get(r.key) ?? []))).map((reason) => (
          <li key={reason}>
            <Pill tone="warning">{t(`tiktok.reason.${reason as "no_settlement"}`)}</Pill>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-berry">{error}</p> : null}
      <div className="mt-4">
        <ReviewTable rows={rows} onChange={setRows} settings={settings} products={products} />
      </div>
    </Card>
  );
}
