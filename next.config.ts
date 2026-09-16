import type { NextConfig } from "next";

/**
 * Browser hardening. Supabase is the only external origin the browser talks
 * to (auth refresh and storage), fonts are self-hosted by next/font, and the
 * app never embeds third-party frames.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // Next.js needs inline bootstrap scripts; no third-party scripts are loaded.
  "script-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")}`.trim(),
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // react-pdf and exceljs are Node libraries that should not be bundled by Turbopack.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  // The PDF renderer reads brand fonts from disk, so the export routes must ship them.
  outputFileTracingIncludes: {
    "/reports/export": ["./public/fonts/**/*"],
    "/audit/export": ["./public/fonts/**/*"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
