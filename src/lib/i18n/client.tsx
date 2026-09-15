"use client";

import { createContext, useContext } from "react";
import { translate, type DictionaryKey, type Locale, type Vars } from "./dictionary";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useContext(LocaleContext);
  return (key: DictionaryKey, vars?: Vars) => translate(locale, key, vars);
}
