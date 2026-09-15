"use server";

import { cookies } from "next/headers";
import { isLocale } from "./dictionary";
import { LOCALE_COOKIE } from "./server";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
