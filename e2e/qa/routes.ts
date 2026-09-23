/**
 * Every route the QA sweep opens, with its expected heading in both
 * languages. Shared by the matrix and the width assertions.
 */
import type { Page } from "@playwright/test";

/** The first matching link's href, or null at once when there is none. */
async function firstHref(page: Page, selector: string): Promise<string | null> {
  const links = page.locator(selector);
  if ((await links.count()) === 0) return null;
  return links.first().getAttribute("href");
}

export type Route = { path: string; title: { en: RegExp; th: RegExp }; adminOnly?: boolean; resolve?: (page: Page) => Promise<string | null> };

export const ROUTES: Route[] = [
  { path: "/", title: { en: /Balanced|owes/i, th: /สมดุล|ค้างจ่าย/ } },
  { path: "/transactions", title: { en: /^Transactions$/, th: /^รายการ$/ } },
  { path: "/transactions/[id]/edit", title: { en: /Edit transaction/, th: /แก้ไขรายการ/ }, resolve: (page) => firstHref(page, 'a[href^="/transactions/"][href$="/edit"]') },
  { path: "/import", title: { en: /^Import$/, th: /^นำเข้า$/ } },
  { path: "/payouts", title: { en: /^Payouts$/, th: /^ยอดโอนเข้า$/ } },
  { path: "/payouts/[id]/reconcile", title: { en: /Match|Reconcile|payout/i, th: /จับคู่|ยอดโอน/ }, resolve: (page) => firstHref(page, 'a[href^="/payouts/"][href$="/reconcile"]') },
  { path: "/products", title: { en: /^Products$/, th: /^สินค้า$/ } },
  { path: "/products/[id]", title: { en: /Rung Nirand|Mali|Rock sugar|Coconut sugar/, th: /น้ำตาล|Rung Nirand|Mali|Rock/ }, resolve: (page) => firstHref(page, 'a[href^="/products/"]:not([href="/products/new"])') },
  { path: "/stock", title: { en: /^Stock$/, th: /^สต็อก$/ } },
  { path: "/investment", title: { en: /^Investment$/, th: /^เงินลงทุน$/ } },
  { path: "/balance", title: { en: /^My Balance$/, th: /^ยอดของฉัน$/ } },
  { path: "/reports", title: { en: /^Reports$/, th: /^รายงาน$/ } },
  { path: "/reports/units", title: { en: /^Units$/, th: /^หน่วยสินค้า$/ } },
  { path: "/insights", title: { en: /^Insights$/, th: /^วิเคราะห์$/ } },
  { path: "/more", title: { en: /^More$/, th: /^เพิ่มเติม$/ } },
  { path: "/more/health", title: { en: /^Data health$/, th: /^สุขภาพข้อมูล$/ } },
  { path: "/more/before", title: { en: /^Before MikiSai$/, th: /^ก่อนเริ่ม MikiSai$/ } },
  { path: "/more/check-books", title: { en: /^Check books$/, th: /^ตรวจบัญชี$/ }, adminOnly: true },
  { path: "/audit", title: { en: /^Audit$/, th: /^ประวัติการแก้ไข$/ }, adminOnly: true },
  { path: "/more/deleted", title: { en: /^Recently deleted$/, th: /^ลบล่าสุด$/ }, adminOnly: true },
  { path: "/customers", title: { en: /^Customers$/, th: /^ลูกค้า$/ } },
  { path: "/settings", title: { en: /^Settings$/, th: /^ตั้งค่า$/ } },
];
