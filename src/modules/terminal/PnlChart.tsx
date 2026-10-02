import { useId } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { usePositionStore } from '@/stores/usePositionStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { fmtSigned, fmtTime } from '@/lib/format';

/** Gradient offset where P/L crosses zero, so one series fills green above and red below. */
export function zeroOffset(values: number[]): number {
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max <= 0) return 0;
  if (min >= 0) return 1;
  return max / (max - min);
}

export function PnlChart({ drag }: { drag?: PanelDragProps }) {
  const history = usePositionStore((s) => s.pnlHistory);
  const realized = usePositionStore((s) => s.realized);
  const { profit, loss } = useThemeStore((s) => s.colors);
  const id = useId().replace(/:/g, '');
  const last = history.at(-1)?.pnl ?? 0;
  const off = history.length ? zeroOffset(history.map((h) => h.pnl)) : 0.5;

  return (
    <Panel
      title="P/L"
      sub={`realized ${fmtSigned(realized)}`}
      drag={drag}
      testId="pnl-chart"
      actions={history.length > 0 && <span className={`num ${last >= 0 ? 'up' : 'down'}`}>{fmtSigned(last)} USDT</span>}
    >
      <div style={{ height: 180 }}>
        {history.length < 2 ? (
          <div className="empty">Open a position to track its P/L in real time.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`pnl-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor={profit} stopOpacity={0.38} />
                  <stop offset={off} stopColor={profit} stopOpacity={0.06} />
                  <stop offset={off} stopColor={loss} stopOpacity={0.06} />
                  <stop offset={1} stopColor={loss} stopOpacity={0.38} />
                </linearGradient>
                <linearGradient id={`pnl-line-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={off} stopColor={profit} />
                  <stop offset={off} stopColor={loss} />
                </linearGradient>
              </defs>
              <YAxis width={56} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtSigned(v, 0)} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Tooltip
                cursor={{ stroke: 'var(--text-faint)', strokeDasharray: '3 3' }}
                contentStyle={{ background: 'color-mix(in srgb, var(--panel-solid) 85%, transparent)', backdropFilter: 'blur(16px)', border: '1px solid var(--border)', borderRadius: 12, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                labelFormatter={(_, p) => (p?.[0] ? fmtTime((p[0].payload as { t: number }).t) : '')}
                formatter={(v) => [fmtSigned(Number(v)) + ' USDT', 'P/L']}
              />
              <Area type="monotone" dataKey="pnl" stroke={`url(#pnl-line-${id})`} strokeWidth={1.6} fill={`url(#pnl-fill-${id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
