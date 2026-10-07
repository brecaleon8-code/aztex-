import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { Plus, Trash2, LineChart, Play, Save, Eye, EyeOff, Copy } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { NumericField } from '@/components/ui/NumericField';
import { useStudioStore, type UserIndicator } from '@/stores/useStudioStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useChartStore } from '@/stores/useChartStore';
import { useFeeStore } from '@/stores/useFeeStore';
import { CATEGORICAL } from '@/stores/useThemeStore';
import { toast } from '@/stores/useToastStore';
import { compile, evaluate } from '@/lib/indicators/formula';
import { backtest, STRATEGY_TEMPLATES, type StrategyDef } from '@/lib/strategy/backtest';
import { FEE_TIERS, fmtRate } from '@/lib/account/fees';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtPct, fmtPrice, fmtTime } from '@/lib/format';
import type { Side, Timeframe } from '@/types';
import { FormulaHelp, FormulaInput } from './FormulaInput';
import './studio.css';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export function StudioPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Studio</h1>
          <p>Build your own indicators and rule-based strategies, backtest them on live history, and plot them on the chart.</p>
        </div>
      </div>
      <div className="studio-grid">
        <IndicatorLibrary />
        <StrategyLab />
      </div>
    </div>
  );
}

/* ── Indicators ─────────────────────────────────────────────────────────────────────────── */

const blankIndicator = (): Omit<UserIndicator, 'id'> & { id?: string } => ({ name: '', formula: '', type: 'overlay', color: CATEGORICAL[1] });

function IndicatorLibrary() {
  const { indicators, saveIndicator, deleteIndicator } = useStudioStore();
  const [draft, setDraft] = useState<Omit<UserIndicator, 'id'> & { id?: string }>(indicators[0] ?? blankIndicator());
  const candles = useMarketStore((s) => s.candles);
  const r = draft.formula.trim() ? compile(draft.formula) : null;
  const preview = useMemo(() => (r?.ok ? evaluate(r.ast, candles).slice(-160) : []), [r, candles]);
  const valid = !!draft.name.trim() && !!r?.ok;

  const addToChart = (i: Omit<UserIndicator, 'id'>) => {
    useChartStore.getState().addIndicator({ kind: 'custom', type: i.type, color: i.color, name: i.name, formula: i.formula });
    toast({ kind: 'success', title: 'Added to chart', detail: i.name });
  };

  return (
    <Panel title="My indicators" sub={`${indicators.length}`} testId="indicator-library" actions={<button className="btn sm" onClick={() => setDraft(blankIndicator())} data-testid="new-indicator"><Plus size={12} /> New</button>}>
      <div className="lib-list">
        {indicators.map((i) => (
          <div key={i.id} className={`lib-item ${draft.id === i.id ? 'on' : ''}`} onClick={() => setDraft(i)} role="button" tabIndex={0} data-testid="indicator-item">
            <span className="swatch-dot" style={{ background: i.color }} />
            <span className="grow">
              <span className="lib-name">{i.name}</span>
              <span className="lib-formula mono">{i.formula}</span>
            </span>
            <span className="label">{i.type === 'overlay' ? 'overlay' : 'pane'}</span>
          </div>
        ))}
        {indicators.length === 0 && <div className="empty">No saved indicators.</div>}
      </div>

      <div className="editor">
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Trend strength" data-testid="ind-name" />
        </label>
        <FormulaInput label="Formula" value={draft.formula} onChange={(formula) => setDraft({ ...draft, formula })} placeholder="ema(close, 9) - ema(close, 21)" testId="ind-formula" />
        <div className="row">
          <Segmented
            value={draft.type}
            onChange={(type) => setDraft({ ...draft, type })}
            ariaLabel="Plot as"
            options={[
              { value: 'overlay', label: 'Overlay' },
              { value: 'oscillator', label: 'Own pane' },
            ]}
          />
          <span className="spacer" />
          <div className="row" style={{ gap: 3 }}>
            {CATEGORICAL.map((c) => (
              <button key={c} aria-label={`Color ${c}`} onClick={() => setDraft({ ...draft, color: c })} className="color-dot" style={{ background: c, outline: c === draft.color ? '2px solid var(--text)' : 'none' }} />
            ))}
          </div>
        </div>
        <FormulaPreview values={preview} color={draft.color} />
        <div className="row">
          <button
            className="btn primary"
            disabled={!valid}
            data-testid="ind-save"
            onClick={() => {
              const saved = saveIndicator(draft);
              setDraft(saved);
              toast({ kind: 'success', title: 'Indicator saved', detail: saved.name });
            }}
          >
            <Save size={12} /> Save
          </button>
          <button className="btn" disabled={!valid} onClick={() => addToChart(draft)} data-testid="ind-add-chart">
            <LineChart size={12} /> Add to chart
          </button>
          <span className="spacer" />
          {draft.id && (
            <button
              className="btn ghost danger"
              onClick={() => {
                deleteIndicator(draft.id!);
                setDraft(blankIndicator());
              }}
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
        <FormulaHelp />
      </div>
    </Panel>
  );
}

function FormulaPreview({ values, color }: { values: (number | null)[]; color: string }) {
  const w = 360;
  const h = 70;
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <div className="preview-empty">Preview appears when the formula is valid.</div>;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - lo) / span) * (h - 8)).toFixed(1)}`;
  });
  return (
    <div className="preview" aria-label="Formula preview">
      <svg width={w} height={h}>
        <path d={d} fill="none" stroke={color} strokeWidth={1.4} />
      </svg>
      <span className="preview-range mono">
        {fmtPrice(hi)} / {fmtPrice(lo)}
      </span>
    </div>
  );
}

/* ── Strategies ─────────────────────────────────────────────────────────────────────────── */

type Draft = Omit<StrategyDef, 'id'> & { id?: string };
const fromTemplate = (i: number): Draft => ({ ...STRATEGY_TEMPLATES[i], color: CATEGORICAL[(i + 1) % CATEGORICAL.length] });

function StrategyLab() {
  const { strategies, saveStrategy, deleteStrategy, chartStrategyId, setChartStrategy } = useStudioStore();
  const [draft, setDraft] = useState<Draft>(strategies[0] ?? fromTemplate(0));
  const candles = useMarketStore((s) => s.candles);
  const symbol = useMarketStore((s) => s.selected);
  const tf = useMarketStore((s) => s.timeframe);
  const tier = useFeeStore((s) => s.tier);
  const navigate = useNavigate();
  const [result, setResult] = useState<ReturnType<typeof backtest> | null>(null);

  // Re-run automatically as rules change or new candles arrive (cheap: a few hundred bars).
  useEffect(() => {
    if (candles.length < 30) return setResult(null);
    setResult(backtest(draft as StrategyDef, candles, FEE_TIERS[tier].taker));
  }, [draft, candles, tier]);

  const valid = !!draft.name.trim() && compile(draft.entry).ok && (!draft.exit?.trim() || compile(draft.exit).ok);
  const onChart = draft.id != null && chartStrategyId === draft.id;

  return (
    <Panel
      title="Strategies"
      sub={`${strategies.length}`}
      className="lab"
      testId="strategy-lab"
      actions={
        <>
          <select className="input tpl-select" value="" onChange={(e) => e.target.value !== '' && setDraft(fromTemplate(+e.target.value))} aria-label="Start from template" data-testid="strategy-template">
            <option value="">Start from template…</option>
            {STRATEGY_TEMPLATES.map((t, i) => (
              <option key={t.name} value={i}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="btn sm" onClick={() => setDraft({ name: '', side: 'Long', entry: '', exit: '', tpPct: 0, slPct: 1, color: CATEGORICAL[1] })} data-testid="new-strategy">
            <Plus size={12} /> New
          </button>
        </>
      }
    >
      <div className="strat-tabs">
        {strategies.map((s) => (
          <button key={s.id} className={`strat-tab ${draft.id === s.id ? 'on' : ''}`} onClick={() => setDraft(s)} data-testid="strategy-item">
            <span className="swatch-dot" style={{ background: s.color }} />
            {s.name}
            {chartStrategyId === s.id && <Eye size={11} className="faint" />}
          </button>
        ))}
      </div>

      <div className="lab-grid">
        <div className="editor">
          <div className="row">
            <label className="field grow">
              <span className="label">Name</span>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="My strategy" data-testid="strat-name" />
            </label>
            <div className="field">
              <span className="label">Direction</span>
              <Segmented<Side>
                value={draft.side}
                onChange={(side) => setDraft({ ...draft, side })}
                ariaLabel="Direction"
                options={[
                  { value: 'Long', label: 'Long' },
                  { value: 'Short', label: 'Short' },
                ]}
              />
            </div>
          </div>
          <FormulaInput label="Entry rule" condition value={draft.entry} onChange={(entry) => setDraft({ ...draft, entry })} placeholder="cross_over(ema(close, 9), ema(close, 21))" testId="strat-entry" />
          <FormulaInput label="Exit rule" condition optional value={draft.exit ?? ''} onChange={(exit) => setDraft({ ...draft, exit })} placeholder="cross_under(ema(close, 9), ema(close, 21))" testId="strat-exit" />
          <div className="row">
            <div className="grow">
              <NumericField label="Take profit %" value={draft.tpPct ?? 0} min={0} onCommit={(tpPct) => setDraft({ ...draft, tpPct })} ariaLabel="Take profit percent" hint="0 = off" />
            </div>
            <div className="grow">
              <NumericField label="Stop loss %" value={draft.slPct ?? 0} min={0} onCommit={(slPct) => setDraft({ ...draft, slPct })} ariaLabel="Stop loss percent" hint="0 = off" />
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button
              className="btn primary"
              disabled={!valid}
              data-testid="strat-save"
              onClick={() => {
                const saved = saveStrategy(draft);
                setDraft(saved);
                toast({ kind: 'success', title: 'Strategy saved', detail: saved.name });
              }}
            >
              <Save size={12} /> Save
            </button>
            <button
              className={`btn ${onChart ? 'active' : ''}`}
              disabled={!valid}
              data-testid="strat-chart"
              onClick={() => {
                const saved = draft.id ? draft : saveStrategy(draft);
                if (!draft.id) setDraft(saved);
                setChartStrategy(onChart ? null : saved.id!);
                if (!onChart) navigate('/terminal');
              }}
            >
              {onChart ? <EyeOff size={12} /> : <Eye size={12} />} {onChart ? 'Hide from chart' : 'Show on chart'}
            </button>
            {draft.id && (
              <button className="btn ghost" onClick={() => setDraft({ ...draft, id: undefined, name: `${draft.name} (copy)` })}>
                <Copy size={12} /> Duplicate
              </button>
            )}
            <span className="spacer" />
            {draft.id && (
              <button
                className="btn ghost danger"
                onClick={() => {
                  deleteStrategy(draft.id!);
                  setDraft(fromTemplate(0));
                }}
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
          <FormulaHelp />
        </div>

        <div className="results" data-testid="backtest-results">
          <div className="row results-head">
            <Play size={12} className="faint" />
            <span className="label">Backtest on</span>
            <select className="input mini-select mono" value={symbol} onChange={(e) => useMarketStore.getState().select(e.target.value)} aria-label="Backtest symbol">
              {ASSET_UNIVERSE.map((a) => (
                <option key={a.symbol}>{a.symbol}</option>
              ))}
            </select>
            <select className="input mini-select mono" value={tf} onChange={(e) => useMarketStore.getState().setTimeframe(e.target.value as Timeframe)} aria-label="Backtest timeframe">
              {TIMEFRAMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <span className="label">
              {candles.length} bars · fees {fmtRate(FEE_TIERS[tier].taker)}/side
            </span>
          </div>
          {!result ? (
            <div className="empty">Loading history…</div>
          ) : !result.ok ? (
            <div className="empty error-text">Fix the {result.field} rule to run the backtest.</div>
          ) : (
            <BacktestView result={result} candles={candles} color={draft.color} />
          )}
        </div>
      </div>
    </Panel>
  );
}

function BacktestView({ result, candles, color }: { result: Extract<ReturnType<typeof backtest>, { ok: true }>; candles: { time: number }[]; color: string }) {
  const { stats, trades, equity } = result;
  const data = equity.map((v, i) => ({ t: candles[i]?.time ?? i, eq: (v - 1) * 100 }));
  const cells: [string, string, string?][] = [
    ['Net return', fmtPct(stats.netPct), stats.netPct >= 0 ? 'up' : 'down'],
    ['Buy & hold', fmtPct(stats.buyHoldPct), stats.buyHoldPct >= 0 ? 'up' : 'down'],
    ['Trades', String(stats.trades)],
    ['Win rate', `${stats.winRate.toFixed(0)}%`],
    ['Profit factor', stats.profitFactor != null ? stats.profitFactor.toFixed(2) : stats.trades > 0 && stats.winRate === 100 ? '∞' : '—'],
    ['Max drawdown', `−${stats.maxDrawdownPct.toFixed(2)}%`, 'down'],
    ['Avg trade', fmtPct(stats.avgTradePct), stats.avgTradePct >= 0 ? 'up' : 'down'],
    ['Exposure', `${stats.exposurePct.toFixed(0)}%`],
  ];
  return (
    <>
      <div className="bt-stats">
        {cells.map(([k, v, cls]) => (
          <div key={k}>
            <span className="label">{k}</span>
            <span className={`mono ${cls ?? ''}`} data-testid={k === 'Trades' ? 'bt-trades' : undefined}>
              {v}
            </span>
          </div>
        ))}
      </div>
      <div className="bt-equity">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="bt-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.3} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis width={46} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              contentStyle={{ background: 'var(--panel-solid)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              labelFormatter={(_, p) => (p?.[0] ? fmtTime((p[0].payload as { t: number }).t, false) : '')}
              formatter={(v) => [fmtPct(Number(v)), 'Equity']}
            />
            <Area type="linear" dataKey="eq" stroke={color} strokeWidth={1.5} fill="url(#bt-fill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="bt-trades">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Reason</th>
              <th className="r">Return</th>
            </tr>
          </thead>
          <tbody>
            {trades
              .slice()
              .reverse()
              .slice(0, 40)
              .map((t, k) => (
                <tr key={t.entryIndex}>
                  <td className="num faint">{trades.length - k}</td>
                  <td className="num">
                    {fmtTime(candles[t.entryIndex].time, false)} <span className="faint">@</span> {fmtPrice(t.entryPrice)}
                  </td>
                  <td className="num">
                    {fmtTime(candles[t.exitIndex].time, false)} <span className="faint">@</span> {fmtPrice(t.exitPrice)}
                  </td>
                  <td>
                    <span className="badge neutral">{t.reason === 'tp' ? 'take profit' : t.reason === 'sl' ? 'stop' : t.reason === 'end' ? 'open' : 'exit rule'}</span>
                  </td>
                  <td className={`r num ${t.returnPct >= 0 ? 'up' : 'down'}`}>{fmtPct(t.returnPct)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {trades.length === 0 && <div className="empty">No entries fired on this history — loosen the entry rule or try another timeframe.</div>}
      </div>
    </>
  );
}
