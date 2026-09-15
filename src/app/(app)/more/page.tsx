import Link from "next/link";
import { LangToggle } from "@/components/nav/LangToggle";
import { Card } from "@/components/ui/Card";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { signOut } from "@/app/login/actions";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";

export default async function MorePage() {
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const tr = t(locale);

  const items = [
    { href: "/import", title: tr("more.import"), desc: tr("more.importDesc") },
    { href: "/payouts", title: tr("more.payouts"), desc: tr("more.payoutsDesc") },
    { href: "/customers", title: tr("more.customers"), desc: tr("more.customersDesc") },
    { href: "/insights", title: tr("more.insights"), desc: tr("more.insightsDesc") },
    { href: "/audit", title: tr("more.audit"), desc: tr("more.auditDesc") },
    { href: "/settings", title: tr("more.settings"), desc: tr("more.settingsDesc") },
    { href: "/more/help", title: tr("more.help"), desc: tr("more.helpDesc") },
  ];

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("more.title")} subtitle={tr("more.subtitle")} />
      <Card className="divide-y divide-line overflow-hidden">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-lavender-tint">
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium text-plum">{item.title}</span>
              <span className="block text-sm text-plum-soft">{item.desc}</span>
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
