import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { requireSession } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone } from "@/lib/labels";
import { num, PLATFORMS, type PlatformSetting } from "@/lib/types";
import { savePlatformSettings } from "./actions";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const [sp, { supabase }, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);

  const { data } = await supabase.from("platform_settings").select("*");
  const settings = new Map<string, PlatformSetting>();
  for (const row of data ?? []) {
    settings.set(row.platform, { ...(row as PlatformSetting), commission_pct: num(row.commission_pct), fixed_fee: num(row.fixed_fee) });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("settings.title")} subtitle={tr("settings.subtitle")} />
      <Card className="p-6">
        <form action={savePlatformSettings} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-3">
            <span></span>
            <span className="text-xs uppercase tracking-wide text-plum-soft">{tr("settings.commission")}</span>
            <span className="text-xs uppercase tracking-wide text-plum-soft">{tr("settings.fixedFee")}</span>
            {PLATFORMS.map((p) => {
              const s = settings.get(p);
              return (
                <div key={p} className="contents">
                  <Pill tone={platformTone(p)} className="justify-self-start">
                    {platformName(tr, p)}
                  </Pill>
                  <Input name={`${p}.commission_pct`} type="number" step="0.01" min="0" max="100" defaultValue={s?.commission_pct ?? 0} className="w-28" aria-label={`${platformName(tr, p)} ${tr("settings.commission")}`} />
                  <Input name={`${p}.fixed_fee`} type="number" step="0.01" min="0" defaultValue={s?.fixed_fee ?? 0} className="w-28" aria-label={`${platformName(tr, p)} ${tr("settings.fixedFee")}`} />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-plum-faint tabular">{tr("settings.formula")}</p>
          {sp.error ? <p className="text-sm text-berry">{tr("common.error")}</p> : null}
          {sp.saved ? <p className="text-sm text-berry">{tr("common.saved")}</p> : null}
          <Button type="submit">{tr("common.save")}</Button>
        </form>
      </Card>
    </div>
  );
}
