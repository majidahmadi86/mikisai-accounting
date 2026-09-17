"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavLinks({ links, className }: { links: { href: string; label: string }[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("items-center gap-1", className)}>
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-2.5 py-2 text-sm whitespace-nowrap transition-colors",
              active ? "bg-lavender-tint text-berry font-medium" : "text-plum-soft hover:text-plum hover:bg-lavender-tint",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
