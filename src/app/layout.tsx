import type { Metadata } from "next";
import { Fraunces, Inter, Noto_Sans_Thai, Noto_Serif_Thai } from "next/font/google";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

const displayThai = Noto_Serif_Thai({
  variable: "--font-display-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const bodyThai = Noto_Sans_Thai({
  variable: "--font-body-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "MikiSai Accounting",
  description: "Shared ledger for the MikiSai founders",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${display.variable} ${displayThai.variable} ${body.variable} ${bodyThai.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
