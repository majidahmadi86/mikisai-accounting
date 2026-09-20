"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

export type NavLink = { href: string; label: string; /** Folds into the More menu between 768 and 1024px. */ collapse?: boolean };

const linkClass = (active: boolean) => cn("rounded-full px-2.5 py-2 text-sm whitespace-nowrap transition-colors", active ? "bg-lavender-tint text-berry font-medium" : "text-plum-soft hover:text-plum hover:bg-lavender-tint");

/**
 * Desktop navigation. It never scrolls sideways: from 1024px every link sits
 * on one line; between 768 and 1024 the least-used links fold into a More menu.
 */
export function NavLinks({ links, className, menuFooter }: { links: NavLink[]; className?: string; /** Language and sign out, which also move into the menu below 1024px. */ menuFooter?: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const folded = links.filter((l) => l.collapse);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav aria-label="Primary" className={cn("items-center gap-1", className)}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={cn(linkClass(isActive(link.href)), link.collapse && "hidden lg:inline-flex")}>
          {link.label}
        </Link>
      ))}
      {folded.length ? (
        <div ref={menu} className="relative lg:hidden">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={t("nav.moreMenu")} className={cn(linkClass(folded.some((l) => isActive(l.href))), "inline-flex min-h-9 items-center gap-1")}>
            {t("nav.more")} <span className={cn("text-[10px] transition-transform", open && "rotate-180")}>▾</span>
          </button>
          {open ? (
            <div role="menu" className="absolute right-0 top-full z-20 mt-2 min-w-44 overflow-hidden rounded-card border border-line bg-card py-1 shadow-[0_8px_24px_rgba(48,35,51,0.15)]">
              {folded.map((link) => (
                <Link key={link.href} href={link.href} role="menuitem" onClick={() => setOpen(false)} className={cn("flex min-h-11 items-center whitespace-nowrap px-4 text-sm", isActive(link.href) ? "bg-lavender-tint font-medium text-berry" : "text-plum-soft hover:bg-lavender-tint hover:text-plum")}>
                  {link.href === "/more" ? t("nav.allPages") : link.label}
                </Link>
              ))}
              {menuFooter}
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
