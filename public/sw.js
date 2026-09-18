/*
  MikiSai service worker. Its only job is the Web Share Target: a POST to
  /import/share (from the Android share sheet) is turned into entries in the
  "mikisai-shared" cache, one per file, and the browser is redirected to
  /import?shared=1 where the page picks them up (src/lib/pwa/shared-files.ts).

  Nothing else is intercepted or cached, so the app behaves exactly as it did
  without a service worker, online and offline. iOS Safari does not support
  share_target; this worker is simply never asked to handle a share there.
*/
const SHARED_CACHE = "mikisai-shared";
const SHARE_PATH = "/import/share";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "POST") return;
  if (new URL(event.request.url).pathname !== SHARE_PATH) return;
  event.respondWith(handleShare(event.request));
});

async function handleShare(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("screenshots").filter((entry) => entry instanceof File);
    const cache = await caches.open(SHARED_CACHE);
    // A share that was never picked up must not mix into this one.
    const stale = await cache.keys();
    await Promise.all(stale.map((key) => cache.delete(key)));
    await Promise.all(
      files.map((file, index) =>
        cache.put(
          `/_shared/${index}`,
          new Response(file, {
            headers: {
              "content-type": file.type || "application/octet-stream",
              // Header values must be ASCII; the reader decodes this back to the original name.
              "x-file-name": encodeURIComponent(file.name),
            },
          }),
        ),
      ),
    );
  } catch {
    // Reading the form can fail (aborted share, storage quota); the person still lands on Import, just without files.
  }
  return Response.redirect("/import?shared=1", 303);
}
