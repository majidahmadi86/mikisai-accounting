import { LangToggle } from "./LangToggle";
import { NavLinks } from "./NavLinks";
import { signOut } from "@/app/login/actions";
import type { Locale, Translator } from "@/lib/i18n/dictionary";

export function AppShell({
  locale,
  tr,
  displayName,
  children,
}: {
  locale: Locale;
  tr: Translator;
  displayName: string;
  children: React.ReactNode;
}) {
  const links = [
    { href: "/", label: tr("nav.dashboard") },
    { href: "/transactions", label: tr("nav.transactions") },
    { href: "/import", label: tr("nav.import") },
    { href: "/payouts", label: tr("nav.payouts") },
    { href: "/customers", label: tr("nav.customers") },
    { href: "/settings", label: tr("nav.settings") },
  ];

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-line bg-porcelain/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-8 min-w-0">
              <span className="font-display text-xl text-sage-deep tracking-tight whitespace-nowrap">
                MikiSai <span className="text-ink-faint">✦</span>
              </span>
              <NavLinks links={links} className="hidden md:flex" />
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs text-ink-soft">
                {tr("nav.signedInAs")} <span className="font-medium text-ink">{displayName}</span>
              </span>
              <LangToggle locale={locale} />
              <form action={signOut}>
                <button type="submit" className="text-xs text-ink-soft hover:text-ink transition-colors">
                  {tr("nav.signOut")}
                </button>
              </form>
            </div>
          </div>
          <NavLinks links={links} className="flex md:hidden pb-3 -mt-2 overflow-x-auto" />
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">{children}</div>
      </main>
    </div>
  );
}
