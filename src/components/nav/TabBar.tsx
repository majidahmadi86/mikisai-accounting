"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BalanceIcon, HomeIcon, LedgerIcon, MoreIcon, PlusIcon } from "@/components/ui/Icons";
import { useQuickEntry } from "@/components/quick-entry/QuickEntryProvider";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

const MORE_ROUTES = ["/more", "/import", "/payouts", "/customers", "/settings", "/insights", "/audit", "/reports", "/products"];

function Tab({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.65rem] font-medium transition-colors", active ? "text-berry" : "text-plum-soft")}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

/** Phone navigation: Home · Ledger · Add · My Balance · More. Reports moved under More. Hidden from md up. */
export function TabBar() {
  const t = useT();
  const pathname = usePathname();
  const { open } = useQuickEntry();
  const isMore = MORE_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ivory/95 backdrop-blur md:hidden pb-safe">
      <div className="mx-auto flex max-w-lg items-stretch px-2">
        <Tab href="/" label={t("nav.home")} icon={<HomeIcon />} active={pathname === "/"} />
        <Tab href="/transactions" label={t("nav.ledger")} icon={<LedgerIcon />} active={pathname.startsWith("/transactions")} />
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => open()}
            aria-label={t("nav.openQuickEntry")}
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-berry text-ivory shadow-[0_6px_18px_rgba(143,49,95,0.35)] ring-4 ring-ivory transition-transform active:scale-95"
          >
            <PlusIcon className="h-7 w-7" />
          </button>
        </div>
        <Tab href="/balance" label={t("nav.balance")} icon={<BalanceIcon />} active={pathname.startsWith("/balance")} />
        <Tab href="/more" label={t("nav.more")} icon={<MoreIcon />} active={isMore} />
      </div>
    </nav>
  );
}
