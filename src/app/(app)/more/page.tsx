import Link from "next/link";
import { LangToggle } from "@/components/nav/LangToggle";
import { Card } from "@/components/ui/Card";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { signOut } from "@/app/login/actions";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";

export default async function MorePage({ searchParams }: PageProps<"/more">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const admin = session.profile.role === "admin";

  const items = [
    { href: "/reports", title: tr("more.reports") },
    { href: "/products", title: tr("nav.products") },
    { href: "/stock", title: tr("stock.title") },
    { href: "/investment", title: tr("investment.title") },
    { href: "/import", title: tr("more.import") },
    { href: "/more/connect-tiktok", title: tr("tiktok.title") },
    { href: "/payouts", title: tr("more.payouts") },
    { href: "/customers", title: tr("more.customers") },
    { href: "/insights", title: tr("more.insights") },
    { href: "/more/health", title: tr("health.title") },
    ...(admin ? [{ href: "/more/check-books", title: tr("more.checkBooks") }, { href: "/audit", title: tr("more.audit") }, { href: "/more/deleted", title: tr("more.deleted") }] : []),
    { href: "/settings", title: tr("more.settings") },
    { href: "/more/help", title: tr("more.help") },
  ];

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("more.title")} subtitle={tr("more.subtitle")} />
      {sp.denied ? <p className="mb-4 rounded-xl bg-warning-tint px-4 py-3 text-sm text-warning-ink">{tr("roles.denied")}</p> : null}
      <Card className="divide-y divide-line overflow-hidden">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-lavender-tint">
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium text-plum">{item.title}</span>
            </span>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-plum-faint" />
          </Link>
        ))}
      </Card>

      <Card className="mt-4 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">{tr("more.language")}</p>
          </div>
          <LangToggle locale={locale} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="eyebrow">{tr("more.account")}</p>
            <p className="mt-1 text-sm text-plum">
              {session.profile.display_name} <span className="text-plum-faint">· {session.email}</span>
            </p>
            <p className="mt-1 text-xs text-plum-soft">{admin ? tr("roles.admin") : `${tr("roles.contributor")} · ${tr("roles.editWindow")}`}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm text-plum-soft transition-colors hover:border-berry hover:text-berry">
              {tr("nav.signOut")}
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
