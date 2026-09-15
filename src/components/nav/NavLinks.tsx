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
              "rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              active ? "bg-sage-tint text-sage-deep font-medium" : "text-ink-soft hover:text-ink hover:bg-porcelain-deep",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
