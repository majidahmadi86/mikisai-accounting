"use client";

import { useEffect } from "react";

/** Registers the share-target service worker (public/sw.js) once per page load. Failure is silent: the app does not depend on it. */
export function RegisterSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
