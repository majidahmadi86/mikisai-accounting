import { cookies } from "next/headers";
import { isLocale, translate, type DictionaryKey, type Locale, type Translator, type Vars } from "./dictionary";

export const LOCALE_COOKIE = "locale";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

export function t(locale: Locale): Translator {
  return (key: DictionaryKey, vars?: Vars) => translate(locale, key, vars);
}
