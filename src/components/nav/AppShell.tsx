import { Brand } from "./Brand";
import { LangToggle } from "./LangToggle";
import { NavLinks } from "./NavLinks";
import { AddButton } from "./AddButton";
import { TabBar } from "./TabBar";
import { SearchOverlay } from "./SearchOverlay";
import Link from "next/link";
import { BoxIcon } from "@/components/ui/Icons";
import { signOut } from "@/app/login/actions";
import type { Locale, Translator } from "@/lib/i18n/dictionary";

export function AppShell({
  locale,
  tr,
  displayName,
  alert = false,
  children,
}: {
  locale: Locale;
  tr: Translator;
  displayName: string;
  /** Data health found something: a red dot on More. */
  alert?: boolean;
  children: React.ReactNode;
}) {
  const links = [
    { href: "/week", label: tr("nav.week") },
    { href: "/", label: tr("nav.home") },
    { href: "/transactions", label: tr("nav.ledger") },
    { href: "/products", label: tr("nav.products") },
    { href: "/stock", label: tr("nav.stock") },
    { href: "/reports", label: tr("nav.reports") },
    { href: "/insights", label: tr("nav.insights"), collapse: true },
    { href: "/more", label: tr("nav.more"), collapse: true, alert },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-ivory/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 xl:max-w-7xl wide:max-w-[88rem]">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4 lg:gap-6">
              <span className="shrink-0">
                <Brand tight />
              </span>
              <NavLinks
                links={links}
                className="hidden md:flex"
                menuFooter={
                  <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2">
                    <LangToggle locale={locale} />
                    <form action={signOut}>
                      <button type="submit" className="min-h-11 whitespace-nowrap text-xs text-plum-soft transition-colors hover:text-plum">
                        {tr("nav.signOut")}
                      </button>
                    </form>
                  </div>
                }
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-3">
              <SearchOverlay />
              <Link href="/products" aria-label={tr("nav.products")} className="flex h-11 w-11 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint hover:text-berry md:hidden">
                <BoxIcon />
              </Link>
              <span className="hidden md:block">
                <AddButton label={tr("nav.add")} iconOnlyOnTablet />
              </span>
              <span className="hidden text-xs text-plum-soft 2xl:inline">
                {tr("nav.signedInAs")} <span className="font-medium text-plum">{displayName}</span>
              </span>
              <span className="md:max-lg:hidden">
                <LangToggle locale={locale} />
              </span>
              <form action={signOut} className="hidden lg:block">
                <button type="submit" className="min-h-11 px-2 text-xs text-plum-soft transition-colors hover:text-plum">
                  {tr("nav.signOut")}
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 pb-24 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10 xl:max-w-7xl wide:max-w-[88rem]">{children}</div>
      </main>
      <TabBar alert={alert} />
    </div>
  );
}
