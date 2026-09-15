import { Card, type CardTone } from "./Card";

export function StatCard({
  label,
  value,
  hint,
  tone = "card",
  info,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: CardTone;
  info?: React.ReactNode;
}) {
  return (
    <Card tone={tone} className="px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {info}
      </div>
      <p className="mt-2 text-2xl font-display tabular text-plum">{value}</p>
      {hint ? <p className="mt-1 text-xs text-plum-faint">{hint}</p> : null}
    </Card>
  );
}
