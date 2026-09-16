import type { NextConfig } from "next";

/**
 * Static browser hardening. The Content-Security-Policy is set per request in
 * src/proxy.ts so it can carry a script nonce.
 */
const securityHeaders = [
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
