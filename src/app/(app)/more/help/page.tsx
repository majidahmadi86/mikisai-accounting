import { HelpTour } from "@/components/tour/HelpTour";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLocale, t } from "@/lib/i18n/server";

export default async function HelpPage() {
  const locale = await getLocale();
  const tr = t(locale);
  const faq = [1, 2, 3, 4] as const;

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("help.title")} subtitle={tr("help.subtitle")} action={<HelpTour label={tr("help.startTour")} />} />
      <Card className="divide-y divide-line">
        {faq.map((n) => (
          <details key={n} className="group px-5 py-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-base font-medium text-plum">
              {tr(`help.q${n}`)}
              <span className="text-plum-faint transition-transform group-open:rotate-90">→</span>
            </summary>
            <p className="pb-4 text-sm leading-relaxed text-plum-soft">{tr(`help.a${n}`)}</p>
          </details>
        ))}
      </Card>
    </div>
  );
}
