import { Brand } from "./Brand";
import { LangToggle } from "./LangToggle";
import { NavLinks } from "./NavLinks";
import { AddButton } from "./AddButton";
import { TabBar } from "./TabBar";
import Link from "next/link";
import { BoxIcon } from "@/components/ui/Icons";
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
    { href: "/", label: tr("nav.home") },
    { href: "/transactions", label: tr("nav.ledger") },
    { href: "/products", label: tr("nav.products") },
    { href: "/stock", label: tr("nav.stock") },
    { href: "/balance", label: tr("nav.balance") },
    { href: "/reports", label: tr("nav.reports") },
    { href: "/insights", label: tr("nav.insights") },
    { href: "/more", label: tr("nav.more") },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-ivory/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4 lg:gap-6">
              <span className="shrink-0">
                <Brand />
              </span>
              <NavLinks links={links} className="hidden min-w-0 overflow-x-auto md:flex" />
            </div>
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-3">
              <Link href="/products" aria-label={tr("nav.products")} className="flex h-11 w-11 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint hover:text-berry md:hidden">
                <BoxIcon />
              </Link>
              <span className="hidden md:block">
                <AddButton label={tr("nav.add")} />
              </span>
              <span className="hidden text-xs text-plum-soft xl:inline">
                {tr("nav.signedInAs")} <span className="font-medium text-plum">{displayName}</span>
              </span>
              <LangToggle locale={locale} />
              <form action={signOut} className="hidden md:block">
                <button type="submit" className="min-h-11 px-2 text-xs text-plum-soft transition-colors hover:text-plum">
                  {tr("nav.signOut")}
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 pb-24 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10">{children}</div>
      </main>
      <TabBar />
    </div>
  );
}
