import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Minus, Plus, ChevronsRight } from 'lucide-react';
import type { Candle, DataPoint, Drawing } from '@/types';
import { useMarketStore } from '@/stores/useMarketStore';
import { useChartStore } from '@/stores/useChartStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { heikinAshi } from '@/lib/chart/heikinAshi';
import { clampViewport, onSeriesGrow, pan, zoom, ZOOM_IN, ZOOM_OUT, type Viewport } from '@/lib/chart/viewport';
import { fibLevels, flagPath, linePath, makeXScale, makeYScale, niceTicks, type XScale, type YScale } from '@/lib/chart/scale';
import { computeIndicator, indicatorLabel, type ComputedIndicator } from '@/lib/indicators/compute';
import { extent } from '@/lib/indicators/series';
import { fmtCompact, fmtDate, fmtPct, fmtPrice, fmtTime, priceDecimals, textOn, clamp } from '@/lib/format';
import { useChartLevels } from './useChartLevels';
import { usePositionStore } from '@/stores/usePositionStore';
import { TIMEFRAME_MS } from '@/lib/mock/candles';
import { useStudioStore } from '@/stores/useStudioStore';
import { useScriptRuns } from '@/lib/script/useScriptRuns';
import { useFeeStore } from '@/stores/useFeeStore';
import { FEE_TIERS } from '@/lib/account/fees';
import { backtest, type BtTrade } from '@/lib/strategy/backtest';
import { volumeProfile, type VolumeProfile } from '@/lib/orderflow/orderflow';

const AXIS_W = 78;
const TIME_H = 22;
const OSC_H = 90;
const DEFAULT_VISIBLE = 90;
const TAG_H = 18;

export function PriceChart() {
  const candles = useMarketStore((s) => s.candles);
  const key = useMarketStore((s) => s.candlesKey);
  const error = useMarketStore((s) => s.candlesError);
  const tf = useMarketStore((s) => s.timeframe);
  const { mode, tool, indicators, drawings, addDrawing, profile: showProfile } = useChartStore();
  const colors = useThemeStore((s) => s.colors);
  const height = useLayoutStore((s) => s.chartHeight);
  const levels = useChartLevels();
  const symbol = useMarketStore((s) => s.selected);
  // Select the stable array, filter in render (a filtering selector would return a new array each call).
  const allWorking = usePositionStore((s) => s.workingOrders);
  const working = allWorking.filter((o) => o.symbol === symbol);
  // Drives the candle-close countdown even when the feed is quiet.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const uidBase = useId().replace(/:/g, '');

  // Size the SVG to the measured pixel box (1 SVG unit = 1px) — never a stretched viewBox.
  const wrapRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // Viewport over the full series.
  const n = candles.length;
  const [vpState, setVp] = useState<Viewport>({ visibleCount: DEFAULT_VISIBLE, viewEnd: 0 });
  const vp = clampViewport(vpState, n);
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const nRef = useRef(n);
  nRef.current = n;
  const seen = useRef({ key: '', n: 0 });
  useEffect(() => {
    if (key !== seen.current.key) {
      if (n > 0) {
        setVp(clampViewport({ visibleCount: DEFAULT_VISIBLE, viewEnd: n }, n));
        seen.current = { key, n };
      }
      return;
    }
    if (n !== seen.current.n) {
      // Capture prev now: the updater runs later, after seen.current has moved on.
      const prev = seen.current.n;
      setVp((v) => onSeriesGrow(v, prev, n));
      seen.current.n = n;
    }
  }, [key, n]);

  const display = useMemo(() => (mode === 'heikin' ? heikinAshi(candles) : candles), [candles, mode]);
  // Indicators: computed once on full real-OHLC history, then windowed at render.
  const deltaByTime = useMarketStore((s) => s.deltaByTime);
  const scriptRuns = useScriptRuns(indicators, candles);
  const computed = useMemo(() => indicators.map((i) => computeIndicator(i, candles, colors, deltaByTime, scriptRuns[i.id])), [indicators, candles, colors, deltaByTime, scriptRuns]);
  const overlays = computed.filter((c) => c.instance.type === 'overlay');
  const oscillators = computed.filter((c) => c.instance.type === 'oscillator');

  const plotW = Math.max(10, width - AXIS_W);
  const plotH = height - TIME_H;
  const start = vp.viewEnd - vp.visibleCount;
  const end = vp.viewEnd;
  const xs = makeXScale(start, vp.visibleCount, plotW);

  const ys = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = Math.max(0, start); i < end; i++) {
      const c = display[i];
      if (!c) continue;
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const ov = extent(
      overlays.filter((o) => o.instance.kind !== 'custom' && o.instance.kind !== 'script' && o.instance.kind !== 'vwap').flatMap((o) => o.lines.map((l) => l.values)),
      start,
      end,
    );
    if (ov) {
      lo = Math.min(lo, ov[0]);
      hi = Math.max(hi, ov[1]);
    }
    return makeYScale(lo, hi, 10, plotH - 6);
  }, [display, overlays, start, end, plotH]);

  const profile = useMemo(
    () => (showProfile ? volumeProfile(candles, start, end, Math.max(16, Math.min(64, Math.round(plotH / 9)))) : null),
    [showProfile, candles, start, end, plotH],
  );

  // Strategy signals from Studio, computed on the full history like indicators.
  const chartStrategy = useStudioStore((s) => s.strategies.find((x) => x.id === s.chartStrategyId) ?? null);
  const tier = useFeeStore((s) => s.tier);
  const strategyTrades = useMemo(() => {
    if (!chartStrategy || candles.length < 2) return null;
    const r = backtest(chartStrategy, candles, FEE_TIERS[tier].taker);
    return r.ok ? r.trades : null;
  }, [chartStrategy, candles, tier]);

  // Interaction state.
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<DataPoint | null>(null);
  const [textDraft, setTextDraft] = useState<{ p: DataPoint; value: string } | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ lastX: number; acc: number } | null>(null);

  useEffect(() => {
    setPending(null);
    setTextDraft(null);
  }, [tool, key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending(null);
        setTextDraft(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ready = n > 0 && !error;
  // Wheel zoom needs a non-passive listener to preventDefault page scroll.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      setVp((v) => zoom(v, e.deltaY < 0 ? ZOOM_IN : ZOOM_OUT, nRef.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ready]);

  const local = (e: RPointerEvent) => {
    const r = mainRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toData = (x: number, y: number): DataPoint => ({ index: x / xs.candleWidth - 0.5 + start, price: ys.toPrice(y) });

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || n === 0) return;
    const { x, y } = local(e);
    if (x > plotW || y > plotH) return;
    if (tool === 'cursor') {
      drag.current = { lastX: e.clientX, acc: 0 };
      setPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const p = toData(x, y);
    if (tool === 'ray') addDrawing({ tool: 'ray', p1: p });
    else if (tool === 'text') setTextDraft({ p, value: '' });
    else if (!pending) setPending(p);
    else {
      addDrawing({ tool, p1: pending, p2: p });
      setPending(null);
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const pt = local(e);
    setHover(pt);
    if (drag.current) {
      const dx = e.clientX - drag.current.lastX;
      drag.current.lastX = e.clientX;
      const r = pan({ vp: vpRef.current, acc: drag.current.acc }, dx, xs.candleWidth, nRef.current);
      drag.current.acc = r.acc;
      if (r.vp !== vpRef.current) {
        vpRef.current = r.vp;
        setVp(r.vp);
      }
    }
  };

  const endPan = () => {
    drag.current = null;
    setPanning(false);
  };

  const commitText = () => {
    if (textDraft && textDraft.value.trim()) addDrawing({ tool: 'text', p1: textDraft.p, text: textDraft.value.trim() });
    setTextDraft(null);
  };

  if (!ready)
    return (
      <div className="chart no-select" ref={wrapRef}>
        {error ? (
          <div className="chart-msg" style={{ height: height + 26 }}>
            Could not load candles: {error}
          </div>
        ) : (
          <div className="chart-skeleton" style={{ height: height + 26 }} aria-label="Loading chart">
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} style={{ height: `${22 + ((i * 37) % 50)}%`, animationDelay: `${(i % 12) * 60}ms` }} />
            ))}
          </div>
        )}
      </div>
    );

  const hoverIdx = hover && hover.x <= plotW && hover.y <= plotH + TIME_H ? clamp(xs.toIndex(hover.x), Math.max(0, start), end - 1) : null;
  const readIdx = hoverIdx ?? n - 1;
  const dec = priceDecimals(candles[n - 1].close);
  const lastC = display[n - 1];
  const cw = xs.candleWidth;
  const bodyW = Math.max(1, Math.min(18, cw * 0.68));
  const clipId = `clip-${uidBase}`;
  const areaId = `area-${uidBase}`;
  const visible: number[] = [];
  for (let i = Math.max(0, start); i < end; i++) visible.push(i);
  const timeStep = Math.max(1, Math.ceil(96 / cw));
  const fmtT = (ms: number) => (tf === '1d' ? fmtDate(ms) : tf === '4h' || tf === '1h' ? `${fmtDate(ms).slice(5)} ${fmtTime(ms, false)}` : fmtTime(ms, false));

  return (
    <div className="chart no-select" ref={wrapRef}>
      <Readout c={candles[readIdx]} prev={candles[readIdx - 1]} dec={dec} hovering={hoverIdx != null} />
      <div className="chart-main" style={{ height }}>
        {overlays.some((o) => o.error) && (
          <div className="chart-ind-errors" data-testid="overlay-error">
            {overlays
              .filter((o) => o.error)
              .map((o) => (
                <span key={o.instance.id}>
                  <b>{indicatorLabel(o.instance)}</b> {o.error}
                </span>
              ))}
          </div>
        )}
        <svg
          ref={mainRef}
          width={width}
          height={height}
          className={`chart-svg tool-${tool} ${panning ? 'panning' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onPointerLeave={() => !drag.current && setHover(null)}
          data-testid="price-chart"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={plotW} height={plotH} />
            </clipPath>
            <linearGradient id={`line-${uidBase}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--series)" />
              <stop offset="1" stopColor="var(--series)" />
            </linearGradient>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--series)" stopOpacity={0.14} />
              <stop offset="1" stopColor="var(--series)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <text x={plotW / 2} y={plotH / 2} className="watermark" textAnchor="middle" dominantBaseline="middle">
            {symbol}/USDT · {tf}
          </text>

          {/* Grid + price axis */}
          {niceTicks(ys.min, ys.max, Math.max(3, Math.round(plotH / 60))).map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={ys.toY(t)} y2={ys.toY(t)} className="grid" />
              <text x={plotW + 8} y={ys.toY(t) + 3.5} className="axis-text">
                {fmtPrice(t, dec)}
              </text>
            </g>
          ))}
          {visible
            .filter((i) => i % timeStep === 0)
            .map((i) => (
              <g key={i}>
                <line x1={xs.toX(i)} x2={xs.toX(i)} y1={0} y2={plotH} className="grid" />
                <text x={xs.toX(i)} y={plotH + 15} className="axis-text" textAnchor="middle">
                  {fmtT(candles[i].time)}
                </text>
              </g>
            ))}
          <line x1={plotW} x2={plotW} y1={0} y2={height} className="axis-line" />
          <line x1={0} x2={width} y1={plotH} y2={plotH} className="axis-line" />

          <g clipPath={`url(#${clipId})`}>
            {hoverIdx != null && <rect x={xs.toX(hoverIdx) - cw / 2} y={0} width={cw} height={plotH} className="hover-col" />}
            {profile && <ProfileLayer p={profile} ys={ys} plotW={plotW} />}
            <g>
              <Series display={display} visible={visible} xs={xs} ys={ys} mode={mode} bodyW={bodyW} bull={colors.bull} bear={colors.bear} areaId={areaId} lineId={`line-${uidBase}`} plotH={plotH} start={start} end={end} />
            </g>
            {end >= n && (
              <g className="live-mark">
                <line x1={0} x2={plotW} y1={ys.toY(lastC.close)} y2={ys.toY(lastC.close)} stroke={lastC.close >= lastC.open ? colors.bull : colors.bear} strokeDasharray="1 3" opacity={0.6} />
                <circle className="last-ring" cx={xs.toX(n - 1)} cy={ys.toY(lastC.close)} r={3} fill="none" stroke={lastC.close >= lastC.open ? colors.bull : colors.bear} strokeWidth={1.5} />
                <circle cx={xs.toX(n - 1)} cy={ys.toY(lastC.close)} r={2.6} fill={lastC.close >= lastC.open ? colors.bull : colors.bear} />
              </g>
            )}
            {overlays.map((o) => (
              <Overlay key={o.instance.id} c={o} xs={xs} ys={ys} start={start} end={end} />
            ))}
            {strategyTrades && chartStrategy && (
              <StrategyMarks trades={strategyTrades} candles={candles} xs={xs} ys={ys} start={start} end={end} color={chartStrategy.color} profit={colors.profit} loss={colors.loss} />
            )}
            {levels.map((l) => (
              <line key={l.key} x1={0} x2={plotW} y1={ys.toY(l.price)} y2={ys.toY(l.price)} stroke={l.fill} strokeWidth={1} strokeDasharray={l.draft ? '2 4' : '5 4'} opacity={l.draft ? 0.7 : 0.9} />
            ))}
            {working.map((o) => (
              <g key={o.id} className="working-line" data-testid="chart-working-order">
                <line x1={0} x2={plotW} y1={ys.toY(o.limitPrice)} y2={ys.toY(o.limitPrice)} />
                <rect x={6} y={ys.toY(o.limitPrice) - 9} width={118} height={18} rx={3} />
                <text x={12} y={ys.toY(o.limitPrice) + 3.5} className="tag-text">
                  {o.side === 'Long' ? 'Buy' : 'Sell'} limit {o.size < 1 ? o.size.toFixed(4) : o.size.toFixed(2)}
                </text>
              </g>
            ))}
            {drawings.map((d) => (
              <DrawingShape key={d.id} d={d} xs={xs} ys={ys} plotW={plotW} dec={dec} />
            ))}
            {pending && hover && <DrawingShape d={{ id: 'preview', tool: tool as Drawing['tool'], p1: pending, p2: toData(hover.x, hover.y) }} xs={xs} ys={ys} plotW={plotW} dec={dec} preview />}
            {hover && hover.x <= plotW && hover.y <= plotH && (
              <g className="crosshair">
                <line x1={hoverIdx != null ? xs.toX(hoverIdx) : hover.x} x2={hoverIdx != null ? xs.toX(hoverIdx) : hover.x} y1={0} y2={plotH} />
                <line x1={0} x2={plotW} y1={hover.y} y2={hover.y} />
              </g>
            )}
          </g>

          {/* Entry / TP / SL flags pinned to the right axis */}
          {levels.map((l) => (
            <PriceTag key={l.key} x={plotW} y={ys.toY(l.price)} text={fmtPrice(l.price, dec)} label={l.label} fill={l.fill} color={l.text} plotH={plotH} />
          ))}
          {/* Last price tag — drawn above the level flags */}
          <PriceTag x={plotW} y={ys.toY(lastC.close)} text={fmtPrice(candles[n - 1].close, dec)} fill={lastC.close >= lastC.open ? colors.bull : colors.bear} color={textOn(lastC.close >= lastC.open ? colors.bull : colors.bear)} plotH={plotH} />
          <CloseCountdown x={plotW} y={ys.toY(lastC.close)} plotH={plotH} msLeft={candles[n - 1].time + TIMEFRAME_MS[tf] - now} />
          {hover && hover.x <= plotW && hover.y <= plotH && (
            <>
              <PriceTag x={plotW} y={hover.y} text={fmtPrice(ys.toPrice(hover.y), dec)} fill="var(--text)" color="var(--bg)" plotH={plotH} />
              {hoverIdx != null && (
                <g>
                  <rect x={xs.toX(hoverIdx) - 46} y={plotH + 2} width={92} height={TAG_H} rx={4} fill="var(--text)" />
                  <text x={xs.toX(hoverIdx)} y={plotH + 15} textAnchor="middle" className="tag-text" fill="var(--bg)">
                    {tf === '1d' ? fmtDate(candles[hoverIdx].time) : `${fmtDate(candles[hoverIdx].time).slice(5)} ${fmtTime(candles[hoverIdx].time, false)}`}
                  </text>
                </g>
              )}
            </>
          )}
        </svg>

        {textDraft && (
          <input
            className="chart-text-input"
            autoFocus
            placeholder="Label…"
            style={{ left: xs.toX(textDraft.p.index), top: ys.toY(textDraft.p.price) - 14 }}
            value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') setTextDraft(null);
            }}
            onBlur={commitText}
          />
        )}

        <div className="chart-zoom">
          <button className="btn sm icon" aria-label="Zoom in" onClick={() => setVp((v) => zoom(v, ZOOM_IN, n))}>
            <Plus size={12} />
          </button>
          <button className="btn sm icon" aria-label="Zoom out" onClick={() => setVp((v) => zoom(v, ZOOM_OUT, n))}>
            <Minus size={12} />
          </button>
          <span className="label mono">{vp.visibleCount} bars</span>
        </div>
        {vp.viewEnd < n && (
          <button className="live-pill" onClick={() => setVp({ ...vp, viewEnd: n })} data-testid="jump-live">
            Viewing history · Jump to live <ChevronsRight size={13} />
          </button>
        )}
        {pending && <div className="chart-hint">Click to place second point · Esc to cancel</div>}
      </div>

      {oscillators.map((o) => (
        <OscillatorPane key={o.instance.id} c={o} width={width} plotW={plotW} xs={xs} start={start} end={end} hoverIdx={hoverIdx} />
      ))}
    </div>
  );
}

/** Volume-by-price histogram anchored to the right edge of the plot, with POC and value area. */
function ProfileLayer({ p, ys, plotW }: { p: VolumeProfile; ys: YScale; plotW: number }) {
  const maxW = plotW * 0.22;
  const poc = p.bins[p.poc];
  const pocY = ys.toY((poc.lo + poc.hi) / 2);
  return (
    <g className="vp" data-testid="volume-profile">
      {p.bins.map((b, i) => {
        const y1 = ys.toY(b.hi);
        const y2 = ys.toY(b.lo);
        const w = (b.volume / (p.max || 1)) * maxW;
        const inVa = i >= p.vaLo && i <= p.vaHi;
        return <rect key={i} x={plotW - w} y={y1 + 0.5} width={w} height={Math.max(1, y2 - y1 - 1)} className={i === p.poc ? 'vp-poc' : inVa ? 'vp-va' : 'vp-out'} />;
      })}
      <line x1={0} x2={plotW} y1={pocY} y2={pocY} className="vp-poc-line" />
      <text x={4} y={pocY - 3} className="vp-label">POC {fmtPrice((poc.lo + poc.hi) / 2)}</text>
      <line x1={0} x2={plotW} y1={ys.toY(p.bins[p.vaHi].hi)} y2={ys.toY(p.bins[p.vaHi].hi)} className="vp-va-line" />
      <line x1={0} x2={plotW} y1={ys.toY(p.bins[p.vaLo].lo)} y2={ys.toY(p.bins[p.vaLo].lo)} className="vp-va-line" />
      <text x={4} y={ys.toY(p.bins[p.vaHi].hi) - 3} className="vp-label dim">VAH</text>
      <text x={4} y={ys.toY(p.bins[p.vaLo].lo) + 10} className="vp-label dim">VAL</text>
    </g>
  );
}

/** Entry ▲/▼ under/over the fill bar, exit dot at the exit price, a thin line joining them. */
function StrategyMarks({ trades, candles, xs, ys, start, end, color, profit, loss }: { trades: BtTrade[]; candles: Candle[]; xs: XScale; ys: YScale; start: number; end: number; color: string; profit: string; loss: string }) {
  return (
    <g className="strategy-marks">
      {trades
        .filter((t) => t.exitIndex >= start && t.entryIndex < end)
        .map((t) => {
          const win = t.returnPct >= 0;
          const ex = xs.toX(t.entryIndex);
          const ec = candles[t.entryIndex];
          const long = t.side === 'Long';
          const ey = long ? ys.toY(ec.low) + 9 : ys.toY(ec.high) - 9;
          const tri = long ? `M${ex},${ey - 5}L${ex - 5},${ey + 4}L${ex + 5},${ey + 4}Z` : `M${ex},${ey + 5}L${ex - 5},${ey - 4}L${ex + 5},${ey - 4}Z`;
          const xx = xs.toX(t.exitIndex);
          const xy = ys.toY(t.exitPrice);
          return (
            <g key={t.entryIndex} data-testid="strategy-marker">
              <line x1={ex} y1={ys.toY(t.entryPrice)} x2={xx} y2={xy} stroke={win ? profit : loss} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
              <path d={tri} fill={color} stroke="var(--panel)" strokeWidth={1} />
              {t.reason !== 'end' && <circle cx={xx} cy={xy} r={3.5} fill="var(--panel)" stroke={win ? profit : loss} strokeWidth={1.6} />}
            </g>
          );
        })}
    </g>
  );
}

/** Time remaining until the forming candle closes, tucked under the last-price tag. */
function CloseCountdown({ x, y, plotH, msLeft }: { x: number; y: number; plotH: number; msLeft: number }) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const text = h > 0 ? `${h}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const cy = clamp(y, TAG_H / 2, plotH - TAG_H / 2) + TAG_H / 2 + 1;
  if (cy + 14 > plotH) return null;
  return (
    <g className="countdown-tag" data-testid="candle-countdown">
      <rect x={x + 6} y={cy} width={AXIS_W - 8} height={14} rx={3} />
      <text x={x + 12} y={cy + 10.5} className="tag-text">
        {text}
      </text>
    </g>
  );
}

function Readout({ c, prev, dec, hovering }: { c: Candle; prev?: Candle; dec: number; hovering: boolean }) {
  const chg = prev ? ((c.close - prev.close) / prev.close) * 100 : ((c.close - c.open) / c.open) * 100;
  const cls = c.close >= c.open ? 'bull' : 'bear';
  return (
    <div className="readout mono" data-testid="ohlcv">
      <span className="faint">{hovering ? fmtTime(c.time, false) : 'Last'}</span>
      <span><span className="faint">O</span> <span className={cls}>{fmtPrice(c.open, dec)}</span></span>
      <span><span className="faint">H</span> <span className={cls}>{fmtPrice(c.high, dec)}</span></span>
      <span><span className="faint">L</span> <span className={cls}>{fmtPrice(c.low, dec)}</span></span>
      <span><span className="faint">C</span> <span className={cls}>{fmtPrice(c.close, dec)}</span></span>
      <span><span className="faint">Vol</span> {fmtCompact(c.volume)}</span>
      <span className={chg >= 0 ? 'bull' : 'bear'}>{fmtPct(chg)}</span>
    </div>
  );
}

interface SeriesProps {
  display: Candle[];
  visible: number[];
  xs: XScale;
  ys: YScale;
  mode: string;
  bodyW: number;
  bull: string;
  bear: string;
  areaId: string;
  lineId: string;
  plotH: number;
  start: number;
  end: number;
}

function Series({ display, visible, xs, ys, mode, bodyW, bull, bear, areaId, lineId, plotH, start, end }: SeriesProps) {
  if (mode === 'line' || mode === 'area') {
    const closes = display.map((c) => c.close);
    const d = linePath(closes, xs, ys, start, end);
    const first = Math.max(0, start);
    const last = Math.min(display.length, end) - 1;
    return (
      <g>
        {mode === 'area' && <path d={`${d}L${xs.toX(last)},${plotH}L${xs.toX(first)},${plotH}Z`} fill={`url(#${areaId})`} />}
        <path d={d} fill="none" stroke={`url(#${lineId})`} strokeWidth={1.5} strokeLinejoin="miter" />
      </g>
    );
  }
  return (
    <g>
      {visible.map((i) => {
        const c = display[i];
        const x = xs.toX(i);
        const col = c.close >= c.open ? bull : bear;
        if (mode === 'bars') {
          const tick = Math.max(2, bodyW / 2);
          return (
            <g key={i} stroke={col} strokeWidth={1.2}>
              <line x1={x} x2={x} y1={ys.toY(c.high)} y2={ys.toY(c.low)} />
              <line x1={x - tick} x2={x} y1={ys.toY(c.open)} y2={ys.toY(c.open)} />
              <line x1={x} x2={x + tick} y1={ys.toY(c.close)} y2={ys.toY(c.close)} />
            </g>
          );
        }
        const yo = ys.toY(c.open);
        const yc = ys.toY(c.close);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={ys.toY(c.high)} y2={ys.toY(c.low)} stroke={col} strokeWidth={1} />
            <rect x={x - bodyW / 2} y={Math.min(yo, yc)} width={bodyW} height={Math.max(1, Math.abs(yc - yo))} fill={col} />
          </g>
        );
      })}
    </g>
  );
}

function Overlay({ c, xs, ys, start, end }: { c: ComputedIndicator; xs: XScale; ys: YScale; start: number; end: number }) {
  if (c.error) return null;
  let band: string | null = null;
  if (c.band) {
    const up: string[] = [];
    const lo: string[] = [];
    for (let i = Math.max(0, start); i < end; i++) {
      const u = c.band.upper[i];
      const l = c.band.lower[i];
      if (u == null || l == null) continue;
      up.push(`${xs.toX(i)},${ys.toY(u)}`);
      lo.unshift(`${xs.toX(i)},${ys.toY(l)}`);
    }
    if (up.length) band = `M${up.join('L')}L${lo.join('L')}Z`;
  }
  return (
    <g>
      {band && <path d={band} fill={c.instance.color} opacity={0.07} />}
      {c.lines.map((l) => (
        <path key={l.key} d={linePath(l.values, xs, ys, start, end)} fill="none" stroke={l.color} strokeWidth={l.width ?? 1.3} strokeDasharray={l.dashed ? '4 3' : undefined} opacity={l.opacity ?? 1} />
      ))}
    </g>
  );
}

function PriceTag({ x, y, text, label, fill, color, plotH }: { x: number; y: number; text: string; label?: string; fill: string; color: string; plotH: number }) {
  const cy = clamp(y, TAG_H / 2, plotH - TAG_H / 2);
  const w = AXIS_W - 2;
  return (
    <g className="price-tag">
      {label && (
        <g>
          <rect x={x - 6 - label.length * 6.2 - 10} y={cy - 8} width={label.length * 6.2 + 10} height={16} rx={4} fill={fill} opacity={0.92} />
          <text x={x - 6 - (label.length * 6.2 + 10) / 2} y={cy + 3.5} textAnchor="middle" className="tag-text" fill={color}>
            {label}
          </text>
        </g>
      )}
      <path d={flagPath(x, cy, w, TAG_H)} fill={fill} />
      <text x={x + 12} y={cy + 3.5} className="tag-text" fill={color}>
        {text}
      </text>
    </g>
  );
}

function DrawingShape({ d, xs, ys, plotW, dec, preview }: { d: Drawing; xs: XScale; ys: YScale; plotW: number; dec: number; preview?: boolean }) {
  const x1 = xs.toX(d.p1.index);
  const y1 = ys.toY(d.p1.price);
  const x2 = d.p2 ? xs.toX(d.p2.index) : x1;
  const y2 = d.p2 ? ys.toY(d.p2.price) : y1;
  const cls = `drawing ${preview ? 'preview' : ''}`;
  switch (d.tool) {
    case 'trend':
      return (
        <g className={cls}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} />
          <circle cx={x1} cy={y1} r={3} />
          <circle cx={x2} cy={y2} r={3} />
        </g>
      );
    case 'ray':
      return (
        <g className={cls}>
          <line x1={x1} y1={y1} x2={plotW} y2={y1} />
          <circle cx={x1} cy={y1} r={3} />
          <text x={plotW - 6} y={y1 - 5} textAnchor="end" className="drawing-label">
            {fmtPrice(d.p1.price, dec)}
          </text>
        </g>
      );
    case 'rect':
      return (
        <g className={cls}>
          <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} className="drawing-fill" />
        </g>
      );
    case 'fib': {
      if (!d.p2) return null;
      const left = Math.min(x1, x2);
      return (
        <g className={cls}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray="3 3" opacity={0.5} />
          {fibLevels(d.p1.price, d.p2.price).map(({ level, price }) => (
            <g key={level}>
              <line x1={left} x2={plotW} y1={ys.toY(price)} y2={ys.toY(price)} opacity={level === 0.5 || level === 0.618 ? 0.95 : 0.6} />
              <text x={left + 4} y={ys.toY(price) - 4} className="drawing-label">
                {(level * 100).toFixed(1).replace(/\.0$/, '')}% · {fmtPrice(price, dec)}
              </text>
            </g>
          ))}
        </g>
      );
    }
    case 'text':
      return (
        <text x={x1} y={y1} className="drawing-text">
          {d.text}
        </text>
      );
  }
}

function OscillatorPane({ c, width, plotW, xs, start, end, hoverIdx }: { c: ComputedIndicator; width: number; plotW: number; xs: XScale; start: number; end: number; hoverIdx: number | null }) {
  const all = [...c.lines.map((l) => l.values), ...(c.bars ? [c.bars.values] : [])];
  let dom = c.domain ?? extent(all, start, end) ?? [0, 1];
  if (c.bars) dom = [Math.min(0, dom[0]), Math.max(0, dom[1])];
  const ys = makeYScale(dom[0], dom[1], 16, OSC_H - 4, c.domain ? 0 : 0.06);
  const idx = hoverIdx ?? Math.min(end, (c.lines[0]?.values ?? c.bars?.values ?? []).length) - 1;
  const val = (c.lines[0]?.values ?? c.bars?.values)?.[idx];
  const bw = Math.max(1, Math.min(14, xs.candleWidth * 0.62));
  const zeroY = ys.toY(0);

  return (
    <div className="osc" data-testid={`osc-${c.instance.kind}`}>
      <svg width={width} height={OSC_H}>
        <line x1={0} x2={width} y1={0.5} y2={0.5} className="axis-line" />
        <line x1={plotW} x2={plotW} y1={0} y2={OSC_H} className="axis-line" />
        {c.guides?.map((g) => (
          <g key={g}>
            <line x1={0} x2={plotW} y1={ys.toY(g)} y2={ys.toY(g)} className="grid" strokeDasharray="3 3" />
            <text x={plotW + 8} y={ys.toY(g) + 3.5} className="axis-text">
              {g}
            </text>
          </g>
        ))}
        {!c.guides && (
          <text x={plotW + 8} y={ys.toY(dom[1]) + 10} className="axis-text">
            {fmtCompact(dom[1])}
          </text>
        )}
        {c.bars &&
          Array.from({ length: Math.max(0, end - Math.max(0, start)) }, (_, k) => Math.max(0, start) + k).map((i) => {
            const v = c.bars!.values[i];
            if (v == null) return null;
            const y = ys.toY(v);
            return <rect key={i} x={xs.toX(i) - bw / 2} y={Math.min(y, zeroY)} width={bw} height={Math.max(1, Math.abs(zeroY - y))} fill={c.bars!.colors[i] ?? c.instance.color} opacity={c.instance.kind === 'volume' ? 0.55 : 0.7} />;
          })}
        {c.lines.map((l) => (
          <path key={l.key} d={linePath(l.values, xs, ys, start, end)} fill="none" stroke={l.color} strokeWidth={1.3} opacity={l.opacity ?? 1} />
        ))}
        {hoverIdx != null && <line x1={xs.toX(hoverIdx)} x2={xs.toX(hoverIdx)} y1={0} y2={OSC_H} className="crosshair-line" />}
      </svg>
      <div className="osc-label">
        <span className="swatch" style={{ background: c.instance.color }} />
        <span>{indicatorLabel(c.instance)}</span>
        {c.error ? <span className="error-text" data-testid="osc-error">{c.error}</span> : c.pending ? <span className="faint">running…</span> : <span className="mono" data-testid="osc-value">{val == null ? '—' : c.instance.kind === 'volume' ? fmtCompact(val) : val.toFixed(2)}</span>}
      </div>
    </div>
  );
}
