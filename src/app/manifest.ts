import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest. The share_target lets the
 * installed app appear in the Android share sheet so screenshots from the
 * TikTok Seller app land on /import: public/sw.js turns the POST into files in
 * Cache Storage and redirects to /import?shared=1. iOS Safari ignores
 * share_target (Add to Home Screen still works, without the share entry).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MikiSai Accounting",
    short_name: "MikiSai",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#302333",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/import/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        files: [{ name: "screenshots", accept: ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"] }],
      },
    },
  };
}
