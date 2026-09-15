import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Jost, Noto_Sans_Thai, Noto_Serif_Thai } from "next/font/google";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const display = Bodoni_Moda({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz"],
});

// Thai faces are not preloaded: English pages never need them, and Thai pages fetch them on first use.
const displayThai = Noto_Serif_Thai({
  variable: "--font-display-thai",
  subsets: ["thai"],
  weight: ["400", "600"],
  preload: false,
});

const body = Jost({
  variable: "--font-body",
  subsets: ["latin"],
});

const bodyThai = Noto_Sans_Thai({
  variable: "--font-body-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600"],
  preload: false,
});

export const metadata: Metadata = {
  title: "MikiSai Accounting",
  description: "Accounting for the MikiSai founders",
  icons: { icon: "/brand/ms-monogram.svg" },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${display.variable} ${displayThai.variable} ${body.variable} ${bodyThai.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
