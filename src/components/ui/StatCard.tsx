import { Card, type CardTone } from "./Card";

export function StatCard({ label, value, hint, tone = "card" }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: CardTone }) {
  return (
    <Card tone={tone} className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-2 text-2xl font-display tabular text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </Card>
  );
}
