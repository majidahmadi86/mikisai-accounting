import type { Locale } from "@/lib/i18n/dictionary";
import { formatDate, thb } from "@/lib/money";

/** 30-day area chart of exposure with the limit drawn as a dashed line. Pure SVG, server rendered. */
export function ExposureChart({ series, limit, locale }: { series: { date: string; value: number }[]; limit: number; locale: Locale }) {
  const w = 600;
  const h = 160;
  const padX = 8;
  const padTop = 12;
  const padBottom = 22;
  const max = Math.max(limit, ...series.map((s) => s.value), 1) * 1.08;
  const x = (i: number) => padX + (i / Math.max(1, series.length - 1)) * (w - padX * 2);
  const y = (v: number) => padTop + (1 - v / max) * (h - padTop - padBottom);
  const points = series.map((s, i) => `${x(i).toFixed(1)},${y(s.value).toFixed(1)}`);
  const area = `M${x(0).toFixed(1)},${y(0).toFixed(1)} L${points.join(" L")} L${x(series.length - 1).toFixed(1)},${y(0).toFixed(1)} Z`;
  const line = `M${points.join(" L")}`;
  const last = series[series.length - 1];
  const first = series[0];
  const labelDates = [first, series[Math.floor(series.length / 2)], last];

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" role="img" aria-label={`${formatDate(first.date, locale)} → ${formatDate(last.date, locale)}: ${thb(last.value)}`}>
        <defs>
          <linearGradient id="exposure-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8f315f" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8f315f" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={padX} x2={w - padX} y1={y(limit)} y2={y(limit)} stroke="#b8862b" strokeDasharray="5 5" strokeWidth="1.5" />
        <text x={w - padX} y={y(limit) - 5} textAnchor="end" fontSize="11" fill="#7d5a1a">
          {thb(limit)}
        </text>
        <path d={area} fill="url(#exposure-fill)" />
        <path d={line} fill="none" stroke="#8f315f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(series.length - 1)} cy={y(last.value)} r="4.5" fill="#8f315f" stroke="#faf7f2" strokeWidth="2" />
        {labelDates.map((d, i) => (
          <text key={d.date} x={i === 0 ? padX : i === 1 ? w / 2 : w - padX} y={h - 6} textAnchor={i === 0 ? "start" : i === 1 ? "middle" : "end"} fontSize="11" fill="#6d636c">
            {formatDate(d.date, locale)}
          </text>
        ))}
      </svg>
    </figure>
  );
}
