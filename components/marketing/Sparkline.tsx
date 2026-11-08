/** Tiny trend line for a price history; flat when there are fewer than two points. */
export function Sparkline({ values, up, className = "" }: { values: number[]; up?: boolean; className?: string }) {
  const w = 64;
  const h = 24;
  const pts = values.length >= 2 ? values : [1, 1];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = up === undefined ? "#94A3B8" : up ? "#E11D48" : "#059669";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Change from the first to the last point, in percent; null when it cannot be computed. */
export function percentChange(values: number[]): number | null {
  if (values.length < 2 || !values[0]) return null;
  return ((values[values.length - 1] - values[0]) / values[0]) * 100;
}

/** "▲ 3.2%" / "▼ 1.0%" for a price change. */
export function formatChange(change: number): string {
  return `${change > 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`;
}
