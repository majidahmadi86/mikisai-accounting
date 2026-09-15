import { translate, type DictionaryKey, type Locale, type Translator, type Vars } from "./dictionary";

/** Translator without the cookie lookup, for route handlers with a known locale and for tests. */
export function t(locale: Locale): Translator {
  return (key: DictionaryKey, vars?: Vars) => translate(locale, key, vars);
}
