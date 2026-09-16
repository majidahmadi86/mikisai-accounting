import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale, t } from "@/lib/i18n/server";
import { platformName, platformTone } from "@/lib/labels";
import { thb } from "@/lib/money";
import { PLATFORMS } from "@/lib/types";
import { savePlatformSettings } from "./actions";
import { CategoryManager } from "@/components/settings/CategoryManager";
import { ProductManager } from "@/components/settings/ProductManager";
import { valueStock } from "@/lib/inventory/valuation";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const [sp, session, locale] = await Promise.all([searchParams, requireSession(), getLocale()]);
  const tr = t(locale);
  const admin = session.profile.role === "admin";
  const snapshot = await getLedgerSnapshot(session.profile.business_id);
  const settings = new Map(snapshot.settings.map((s) => [s.platform, s]));
  const ro = !admin;

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("settings.title")} subtitle={tr("settings.subtitle")} />
      {ro ? <p className="mb-4 rounded-xl bg-lavender-tint px-4 py-3 text-sm text-plum">{tr("settings.adminOnly")}</p> : null}
      {sp.error === "denied" ? <p className="mb-4 rounded-xl bg-warning-tint px-4 py-3 text-sm text-warning-ink">{tr("roles.denied")}</p> : null}
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
                  <Input id={`${p}-commission`} name={`${p}.commission_pct`} type="number" inputMode="decimal" step="0.01" min="0" max="100" defaultValue={s?.commission_pct ?? 0} className="tabular" readOnly={ro} />
                </Field>
                <Field label={tr("settings.fixedFee")} htmlFor={`${p}-fee`} hint={tr("settings.fixedFeeHint")}>
                  <Input id={`${p}-fee`} name={`${p}.fixed_fee`} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={s?.fixed_fee ?? 0} className="tabular" readOnly={ro} />
                </Field>
                <Field label={tr("settings.lag")} htmlFor={`${p}-lag`} hint={tr("settings.lagHint")}>
                  <Input id={`${p}-lag`} name={`${p}.settlement_lag_days`} type="number" inputMode="numeric" step="1" min="0" max="120" defaultValue={s?.settlement_lag_days ?? 10} className="tabular" readOnly={ro} />
                </Field>
                <Field label={tr("settings.dailyPct")} htmlFor={`${p}-early`} hint={tr("settings.dailyPctHint")}>
                  <Input id={`${p}-early`} name={`${p}.daily_payout_pct`} type="number" inputMode="decimal" step="1" min="0" max="100" defaultValue={s?.daily_payout_pct ?? 100} className="tabular" readOnly={ro} />
                </Field>
              </div>
            </Card>
          );
        })}
        <p className="px-1 text-xs text-plum-faint tabular">{tr("settings.formula")}</p>

        <Card className="p-5">
          <p className="eyebrow">{tr("settings.exposureTitle")}</p>
          <p className="mb-4 mt-1 text-sm text-plum-soft">{tr("settings.exposureDesc")}</p>
          <Field label={tr("settings.exposure")} htmlFor="exposure_limit" hint={tr("settings.exposureHint")}>
            <Input id="exposure_limit" name="exposure_limit" type="number" inputMode="decimal" step="100" min="0" defaultValue={snapshot.business.exposure_limit} className="tabular text-lg" readOnly={ro} />
          </Field>
          <p className="mt-2 text-xs text-plum-faint">{thb(snapshot.business.exposure_limit)}</p>
        </Card>

        {sp.error && sp.error !== "denied" ? <p className="rounded-xl bg-berry-tint px-3 py-2 text-sm text-berry">{tr("common.error")}</p> : null}
        {sp.saved ? <p className="rounded-xl bg-success-tint px-3 py-2 text-sm text-success">{tr("settings.saved")}</p> : null}
        {admin ? (
          <div className="sticky bottom-20 z-10 -mx-4 border-t border-line bg-ivory/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <Button type="submit" className="w-full md:w-auto">
              {tr("common.save")}
            </Button>
          </div>
        ) : null}
      </form>

      <div className="mt-6">
        <CategoryManager categories={snapshot.categories} tr={tr} admin={admin} />
      </div>
      <div className="mt-6">
        <ProductManager stock={valueStock(snapshot.products, snapshot.movements).products} tr={tr} admin={admin} />
      </div>
    </div>
  );
}
