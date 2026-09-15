import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
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
      <form action={savePlatformSettings} className="space-y-3">
        {PLATFORMS.map((p) => {
          const s = settings.get(p);
          return (
            <Card key={p} className="p-5">
              <Pill tone={platformTone(p)} className="mb-4">
                {platformName(tr, p)}
              </Pill>
              <div className="grid grid-cols-2 gap-4">
                <Field label={tr("settings.commission")} htmlFor={`${p}-commission`} hint={tr("settings.commissionHint")}>
                  <Input id={`${p}-commission`} name={`${p}.commission_pct`} type="number" inputMode="decimal" step="0.01" min="0" max="100" defaultValue={s?.commission_pct ?? 0} className="tabular" />
                </Field>
                <Field label={tr("settings.fixedFee")} htmlFor={`${p}-fee`} hint={tr("settings.fixedFeeHint")}>
                  <Input id={`${p}-fee`} name={`${p}.fixed_fee`} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={s?.fixed_fee ?? 0} className="tabular" />
                </Field>
              </div>
            </Card>
          );
        })}
        <p className="px-1 text-xs text-plum-faint tabular">{tr("settings.formula")}</p>
        {sp.error ? <p className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{tr("common.error")}</p> : null}
        {sp.saved ? <p className="rounded-xl bg-success-tint px-3 py-2 text-sm text-success">{tr("settings.saved")}</p> : null}
        <div className="sticky bottom-20 z-10 -mx-4 border-t border-line bg-ivory/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          <Button type="submit" className="w-full md:w-auto">
            {tr("common.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
