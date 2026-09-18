/**
 * Client-side helpers for the installed app. No server imports: this file is
 * meant for client components on /import and for install hints.
 */

const SHARED_CACHE = "mikisai-shared";

function indexOf(request: Request): number {
  const last = new URL(request.url).pathname.split("/").pop() ?? "";
  const n = Number(last);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function decodeName(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  try {
    return decodeURIComponent(raw) || fallback;
  } catch {
    return raw;
  }
}

/**
 * Takes the files the service worker stored for a share (cache "mikisai-shared",
 * keys /_shared/<index>) as File objects in share order, and removes them so a
 * reload of /import does not import them twice. Empty when Cache Storage is
 * unavailable (insecure context, some private modes) or nothing was shared.
 */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  try {
    const cache = await caches.open(SHARED_CACHE);
    const keys = [...(await cache.keys())].sort((a, b) => indexOf(a) - indexOf(b));
    const files: File[] = [];
    for (const key of keys) {
      const response = await cache.match(key);
      await cache.delete(key);
      if (!response) continue;
      const blob = await response.blob();
      const type = response.headers.get("content-type") ?? blob.type;
      const name = decodeName(response.headers.get("x-file-name"), `shared-${files.length + 1}`);
      files.push(new File([blob], name, { type }));
    }
    return files;
  } catch {
    return [];
  }
}

/** True when the app runs from the home screen (installed) rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
}

/** Rough platform from the user agent, for install hints. iPadOS reports itself as a Mac with touch. */
export function platformHint(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}
