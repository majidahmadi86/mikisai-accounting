"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n/client";

/**
 * Global search: order id, customer, amount or a word from a note. An input
 * on wide screens, a single icon that opens /search on phones.
 */
export function SearchBox() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  return (
    <>
      <form
        role="search"
        className="hidden 2xl:block"
        onSubmit={(e) => {
          e.preventDefault();
          const query = q.trim();
          router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
        }}
      >
        <label className="relative block">
          <span className="sr-only">{t("search.title")}</span>
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-plum-faint">
            <SearchIcon className="h-4 w-4" />
          </span>
          <input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.title")}
            className="min-h-10 w-52 rounded-full border border-line bg-card pl-8 pr-3 text-sm text-plum placeholder:text-plum-faint focus:border-berry focus:outline-none focus:ring-2 focus:ring-lavender xl:w-64"
          />
        </label>
      </form>
      <Link href="/search" aria-label={t("search.title")} className="flex h-11 w-11 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint hover:text-berry 2xl:hidden">
        <SearchIcon />
      </Link>
    </>
  );
}
