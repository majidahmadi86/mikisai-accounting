import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { num, PLATFORMS, type PlatformSetting } from "@/lib/types";
import { getLedgerSnapshot } from "@/lib/data/ledger";

// The import module (file handling, review grid) is only loaded on this route.
const ImportWorkbench = dynamic(() => import("@/components/import/ImportWorkbench").then((m) => m.ImportWorkbench), {
  loading: () => <div className="h-64 animate-pulse rounded-card border border-line bg-card" aria-hidden="true" />,
});

export default async function ImportPage() {
  const [{ supabase, profile }, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);

  const [{ data }, snapshot] = await Promise.all([supabase.from("platform_settings").select("platform, commission_pct, fixed_fee"), getLedgerSnapshot(profile.business_id)]);
  const settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[] = PLATFORMS.map((p) => {
    const row = (data ?? []).find((r) => r.platform === p);
    return { platform: p, commission_pct: num(row?.commission_pct), fixed_fee: num(row?.fixed_fee) };
  });

  return (
    <div>
      <PageHeader title={tr("import.title")} subtitle={tr("import.subtitle")} />
      <ImportWorkbench settings={settings} defaultReceivedBy={profile.display_name === "Sai" ? "sai" : "mike"} products={snapshot.products.filter((p) => p.active)} admin={profile.role === "admin"} />
    </div>
  );
}
