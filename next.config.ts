import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-pdf and exceljs are Node libraries that should not be bundled by Turbopack.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  // The PDF renderer reads brand fonts from disk, so the export routes must ship them.
  outputFileTracingIncludes: {
    "/reports/export": ["./public/fonts/**/*"],
    "/audit/export": ["./public/fonts/**/*"],
  },
};

export default nextConfig;
