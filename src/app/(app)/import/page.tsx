import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { num, PLATFORMS, type PlatformSetting } from "@/lib/types";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { SyncQueue, type QueuedOrder } from "@/components/import/SyncQueue";
import type { ReviewRow } from "@/lib/parse/schema";

// The import module (file handling, review grid) is only loaded on this route.
const ImportWorkbench = dynamic(() => import("@/components/import/ImportWorkbench").then((m) => m.ImportWorkbench), {
  loading: () => <div className="h-64 animate-pulse rounded-card border border-line bg-card" aria-hidden="true" />,
});

export default async function ImportPage() {
  const [{ supabase, profile }, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);

  const [{ data }, snapshot, { data: queueRows }] = await Promise.all([supabase.from("platform_settings").select("platform, commission_pct, fixed_fee"), getLedgerSnapshot(profile.business_id), supabase.from("sync_queue").select("id, order_ref, reasons, row").eq("status", "pending").order("created_at").limit(200)]);
  const queued: QueuedOrder[] = (queueRows ?? []).map((q) => ({ id: q.id as string, order_ref: q.order_ref as string, reasons: (q.reasons ?? []) as string[], row: q.row as ReviewRow }));
  const settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[] = PLATFORMS.map((p) => {
    const row = (data ?? []).find((r) => r.platform === p);
    return { platform: p, commission_pct: num(row?.commission_pct), fixed_fee: num(row?.fixed_fee) };
  });

  return (
    <div>
      <PageHeader title={tr("import.title")} subtitle={tr("import.subtitle")} />
      <SyncQueue key={queued.map((q) => q.id).join(",")} queued={queued} settings={settings} products={snapshot.products.filter((p) => p.active)} />
      <ImportWorkbench settings={settings} defaultReceivedBy={profile.display_name === "Sai" ? "sai" : "mike"} products={snapshot.products.filter((p) => p.active)} admin={profile.role === "admin"} />
    </div>
  );
}
