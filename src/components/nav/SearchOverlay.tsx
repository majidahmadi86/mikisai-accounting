"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchAll } from "@/app/(app)/search/actions";
import { CloseIcon, SearchIcon } from "@/components/ui/Icons";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatDate, thb } from "@/lib/money";
import { SEARCH_GROUPS, type SearchHit } from "@/lib/search";
import { cn } from "@/lib/cn";

/**
 * Global search. The header only carries a magnifier button; the button or
 * Ctrl/Cmd+K opens a full-width overlay. Results are grouped (order ID,
 * customer, amount, note, product); arrows move, Enter opens, Esc closes.
 */
export function SearchOverlay() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Debounced lookup; a slower earlier answer never overwrites a newer one.
  useEffect(() => {
    const query = q.trim();
    const id = ++seq.current;
    const timer = window.setTimeout(
      () => {
        if (!open || query.length < 2) {
          setHits([]);
          setBusy(false);
          return;
        }
        setBusy(true);
        void searchAll(query)
          .then((r) => {
            if (id !== seq.current) return;
            setHits(r);
            setActive(0);
          })
          .catch(() => {
            if (id === seq.current) setHits([]);
          })
          .finally(() => {
            if (id === seq.current) setBusy(false);
          });
      },
      query.length < 2 ? 0 : 200,
    );
    return () => window.clearTimeout(timer);
  }, [q, open]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close() {
    setOpen(false);
    setQ("");
    setHits([]);
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hits.length) setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hits.length) setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const query = q.trim();
      if (hits[active]) go(hits[active].href);
      else if (query) go(`/search?q=${encodeURIComponent(query)}`);
    }
  }

  const query = q.trim();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("search.open")} title={t("search.open")} aria-haspopup="dialog" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint hover:text-berry">
        <SearchIcon />
      </button>
      {open ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={t("search.title")} onKeyDown={onKeyDown}>
          <button type="button" aria-label={t("common.close")} tabIndex={-1} onClick={close} className="absolute inset-0 h-full w-full cursor-default bg-plum/40 backdrop-blur-[2px]" />
          <div className="relative w-full border-b border-line bg-ivory shadow-[0_12px_32px_rgba(48,35,51,0.18)]">
            <div className="mx-auto w-full max-w-4xl px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-center gap-2">
                <label className="relative block min-w-0 flex-1">
                  <span className="sr-only">{t("search.title")}</span>
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-plum-faint">
                    <SearchIcon className="h-5 w-5" />
                  </span>
                  <input
                    ref={input}
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("search.placeholder")}
                    role="combobox"
                    aria-expanded={hits.length > 0}
                    aria-controls="search-overlay-results"
                    aria-activedescendant={hits[active] ? `search-hit-${active}` : undefined}
                    autoComplete="off"
                    className="min-h-12 w-full rounded-2xl border border-line bg-card pl-12 pr-4 text-base text-plum placeholder:text-plum-faint focus:border-berry focus:outline-none focus:ring-2 focus:ring-lavender"
                  />
                </label>
                <button type="button" onClick={close} aria-label={t("common.close")} title={`${t("common.close")} (Esc)`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-plum-soft hover:bg-lavender-tint hover:text-berry">
                  <CloseIcon />
                </button>
              </div>
              <div ref={list} id="search-overlay-results" role="listbox" aria-label={t("search.title")} className="mt-3 max-h-[70vh] overflow-y-auto overscroll-contain">
                {query.length < 2 ? <p className="px-1 pb-2 text-sm text-plum-soft">{t("search.hint")}</p> : null}
                {query.length >= 2 && !busy && hits.length === 0 ? <p className="px-1 pb-2 text-sm text-plum-soft">{t("search.none")}</p> : null}
                {SEARCH_GROUPS.map((group) => {
                  const rows = hits.map((h, i) => ({ h, i })).filter((x) => x.h.group === group);
                  if (!rows.length) return null;
                  return (
                    <div key={group} role="group" aria-label={t(`search.group.${group}`)} className="mb-3">
                      <p className="eyebrow px-1 pb-1">{t(`search.group.${group}`)}</p>
                      <ul className="overflow-hidden rounded-card border border-line bg-card">
                        {rows.map(({ h, i }) => (
                          <li key={`${h.group}-${h.id}`} id={`search-hit-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(h.href)} className={cn("flex min-h-12 cursor-pointer items-center justify-between gap-3 border-b border-line/70 px-4 py-2 last:border-b-0", i === active ? "bg-lavender-tint" : "")}>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-plum">{h.title || "·"}</span>
                              <span className="block truncate text-xs text-plum-faint">{[h.date ? formatDate(h.date, locale) : "", h.detail].filter(Boolean).join(" · ")}</span>
                            </span>
                            {h.amount !== null ? <span className={cn("shrink-0 whitespace-nowrap text-sm font-medium tabular", h.amount < 0 ? "text-plum-soft" : "text-berry")}>{thb(h.amount)}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {query.length >= 2 ? (
                  <button type="button" onClick={() => go(`/search?q=${encodeURIComponent(query)}`)} className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-berry hover:underline">
                    {t("search.seeAll", { q: query })} →
                  </button>
                ) : null}
                <p className="mt-1 hidden px-1 pb-1 text-xs text-plum-faint md:block">{t("search.keys")}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
