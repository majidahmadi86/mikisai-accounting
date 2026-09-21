import { AppShell } from "@/components/nav/AppShell";
import { RegisterSw } from "@/components/pwa/RegisterSw";
import { QuickEntryProvider, type QuickEntryContextData } from "@/components/quick-entry/QuickEntryProvider";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { fifoBacklog } from "@/lib/inventory/backlog";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale, t } from "@/lib/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);
  const snapshot = await getLedgerSnapshot(session.profile.business_id);

  // Smart defaults for the quick-entry sheet: last used platform and product, the signed-in person.
  // The last sale, not the last row: an expense carries no platform worth repeating.
  const last = snapshot.transactions.find((tx) => tx.type === "income") ?? snapshot.transactions[0];
  const quick: QuickEntryContextData = {
    person: session.profile.display_name === "Sai" ? "sai" : "mike",
    lastPlatform: last?.platform ?? "tiktok",
    lastProduct: last?.product_line ?? "sugar",
    settings: snapshot.settings.map((s) => ({ platform: s.platform, commission_pct: s.commission_pct, fixed_fee: s.fixed_fee })),
    customers: snapshot.customers.slice(0, 300).map((c) => ({ name: c.name, platform: c.platform })),
    categories: snapshot.categories.filter((c) => c.active),
    products: snapshot.products.filter((p) => p.active),
    backlog: Object.fromEntries(Array.from(fifoBacklog(snapshot.movements).values()).filter((b) => b.backlog > 0).map((b) => [b.product_id, b.backlog])),
    lastProductId: (() => {
      // The most recent sale that names a product, so the sheet preselects what was sold last.
      for (const tx of snapshot.transactions) {
        if (tx.type !== "income") continue;
        const item = snapshot.items.find((i) => i.transaction_id === tx.id);
        if (item) return item.product_id;
      }
      return null;
    })(),
  };

  return (
    <LocaleProvider locale={locale}>
      <RegisterSw />
      <QuickEntryProvider data={quick}>
        <AppShell locale={locale} tr={tr} displayName={session.profile.display_name}>
          {children}
        </AppShell>
      </QuickEntryProvider>
    </LocaleProvider>
  );
}
