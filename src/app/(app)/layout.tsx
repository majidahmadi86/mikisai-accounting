import { AppShell } from "@/components/nav/AppShell";
import { requireSession } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale, t } from "@/lib/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);
  return (
    <LocaleProvider locale={locale}>
      <AppShell locale={locale} tr={tr} displayName={session.profile.display_name}>
        {children}
      </AppShell>
    </LocaleProvider>
  );
}
