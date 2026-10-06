import { useId } from 'react';

/** Inline 24h trend with a faint area fill; colour follows direction over the window. */
export function Sparkline({ values, width = 64, height = 22, up, down }: { values: number[]; width?: number; height?: number; up: string; down: string }) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return <svg width={width} height={height} aria-hidden className="spark spark-empty" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - lo) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const color = values[values.length - 1] >= values[0] ? up : down;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden className="spark">
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.22} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#sp-${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={1.8} fill={color} />
    </svg>
  );
}
