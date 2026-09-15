import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { getLocale, t } from "@/lib/i18n/server";
import { LangToggle } from "@/components/nav/LangToggle";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const locale = await getLocale();
  const tr = t(locale);
  const errorKey = typeof error === "string" ? error : null;

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-sage-deep font-medium">MikiSai</p>
          <h1 className="mt-2 text-4xl text-ink">{tr("login.title")}</h1>
          <p className="mt-2 text-sm text-ink-soft">{tr("login.subtitle")}</p>
        </div>
        <Card className="p-6">
          <form action={signIn} className="space-y-4">
            <Field label={tr("login.email")} htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label={tr("login.password")} htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            {errorKey ? (
              <p className="rounded-xl bg-clay-tint px-3 py-2 text-sm text-clay">
                {errorKey === "no-profile" ? tr("login.errorNoProfile") : tr("login.errorInvalid")}
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              {tr("login.submit")}
            </Button>
          </form>
        </Card>
        <div className="mt-6 flex justify-center">
          <LangToggle locale={locale} />
        </div>
      </div>
    </main>
  );
}
