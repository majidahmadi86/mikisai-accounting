import { addCategory, moveCategory, renameCategory, setCategoryActive } from "@/app/(app)/settings/categories-actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import type { ExpenseCategory } from "@/lib/categories";
import type { Translator } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/cn";

/** Admin list: rename in both languages, reorder, deactivate, add. Contributors see it read-only. */
export function CategoryManager({ categories, tr, admin }: { categories: ExpenseCategory[]; tr: Translator; admin: boolean }) {
  const sorted = [...categories].sort((a, b) => a.sort - b.sort);
  return (
    <Card className="p-5" >
      <div id="categories" className="scroll-mt-24">
        <p className="eyebrow">{tr("settings.categories")}</p>
        <p className="mb-4 mt-1 text-sm text-plum-soft">{tr("settings.categoriesDesc")}</p>
      </div>
      <ul className="divide-y divide-line">
        {sorted.map((c, i) => (
          <li key={c.id} className={cn("py-3", !c.active && "opacity-60")}>
            {admin ? (
              <form action={renameCategory.bind(null, c.id)} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <label className="block">
                  <span className="eyebrow mb-1 block">{tr("settings.nameEn")}</span>
                  <Input name="name_en" defaultValue={c.name_en} required maxLength={60} />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">{tr("settings.nameTh")}</span>
                  <Input name="name_th" defaultValue={c.name_th} required maxLength={60} />
                </label>
                <Button type="submit" variant="secondary" className="px-3">
                  {tr("common.save")}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-plum">
                {c.name_en} <span className="text-plum-faint">· {c.name_th}</span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Pill tone={c.active ? "success" : "neutral"}>{c.active ? tr("settings.active") : tr("settings.inactive")}</Pill>
              {admin ? (
                <>
                  <form action={moveCategory.bind(null, c.id, "up")}>
                    <button type="submit" disabled={i === 0} className="min-h-9 rounded-full border border-line px-3 text-xs text-plum-soft disabled:opacity-40" aria-label={tr("settings.moveUp")}>
                      ↑
                    </button>
                  </form>
                  <form action={moveCategory.bind(null, c.id, "down")}>
                    <button type="submit" disabled={i === sorted.length - 1} className="min-h-9 rounded-full border border-line px-3 text-xs text-plum-soft disabled:opacity-40" aria-label={tr("settings.moveDown")}>
                      ↓
                    </button>
                  </form>
                  <form action={setCategoryActive.bind(null, c.id, !c.active)}>
                    <button type="submit" className="min-h-9 rounded-full border border-line px-3 text-xs text-plum-soft hover:border-berry hover:text-berry">
                      {c.active ? tr("settings.deactivate") : tr("settings.activate")}
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {admin ? (
        <form action={addCategory} className="mt-4 grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t border-line pt-4">
          <label className="block">
            <span className="eyebrow mb-1 block">{tr("settings.nameEn")}</span>
            <Input name="name_en" required maxLength={60} placeholder={tr("settings.newCategory")} />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{tr("settings.nameTh")}</span>
            <Input name="name_th" required maxLength={60} />
          </label>
          <Button type="submit" className="px-4">
            {tr("common.add")}
          </Button>
        </form>
      ) : null}
      <p className="mt-3 text-xs text-plum-faint">{tr("settings.deactivateHint")}</p>
    </Card>
  );
}
