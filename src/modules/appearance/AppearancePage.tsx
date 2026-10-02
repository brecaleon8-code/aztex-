import { RotateCcw, Database } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { useThemeStore, DEFAULT_COLORS, type Theme } from '@/stores/useThemeStore';
import { useMarketStore } from '@/stores/useMarketStore';
import type { AppearanceColors } from '@/types';
import type { ProviderId } from '@/lib/data';
import './appearance.css';

const PICKERS: { key: keyof AppearanceColors; label: string; hint: string }[] = [
  { key: 'bull', label: 'Bullish candle', hint: 'Up candles, volume, MACD histogram' },
  { key: 'bear', label: 'Bearish candle', hint: 'Down candles, volume, MACD histogram' },
  { key: 'profit', label: 'Take-profit / profit', hint: 'TP line, positive P/L, mountain-chart profit fill' },
  { key: 'loss', label: 'Stop-loss / loss', hint: 'SL line, negative P/L, mountain-chart loss fill' },
];

const PREVIEW = [
  [40, 62, 34, 58],
  [58, 66, 50, 52],
  [52, 54, 38, 41],
  [41, 49, 30, 46],
  [46, 72, 44, 70],
  [70, 78, 61, 64],
  [64, 84, 62, 82],
];

export function AppearancePage() {
  const { colors, setColor, resetColors, theme, setTheme } = useThemeStore();
  const providerId = useMarketStore((s) => s.providerId);
  const isDefault = (Object.keys(DEFAULT_COLORS) as (keyof AppearanceColors)[]).every((k) => colors[k].toLowerCase() === DEFAULT_COLORS[k].toLowerCase());

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Appearance</h1>
          <p>Candle and P/L colors are independent of light/dark mode and apply live across every chart, position and P/L view.</p>
        </div>
      </div>
      <div className="appearance-grid">
        <Panel
          title="Candle & P/L palette"
          testId="palette"
          actions={
            <button className="btn sm" onClick={resetColors} disabled={isDefault} data-testid="reset-colors">
              <RotateCcw size={12} /> Reset to defaults
            </button>
          }
        >
          <div className="pickers">
            {PICKERS.map((p) => (
              <label key={p.key} className="picker">
                <input type="color" value={colors[p.key]} onChange={(e) => setColor(p.key, e.target.value)} aria-label={p.label} data-testid={`color-${p.key}`} />
                <span className="grow">
                  <span className="picker-label">{p.label}</span>
                  <span className="label">{p.hint}</span>
                </span>
                <span className="mono dim">{colors[p.key].toUpperCase()}</span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="Live preview">
          <div className="preview">
            <svg width="100%" height="150" viewBox="0 0 240 100" preserveAspectRatio="xMidYMid meet" aria-label="Candle preview">
              {PREVIEW.map(([o, h, l, c], i) => {
                const x = 22 + i * 30;
                const col = c >= o ? colors.bull : colors.bear;
                const y = (v: number) => 100 - v;
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={y(h)} y2={y(l)} stroke={col} strokeWidth={1.5} />
                    <rect x={x - 7} y={y(Math.max(o, c))} width={14} height={Math.max(1.5, Math.abs(c - o))} fill={col} rx={1.5} />
                  </g>
                );
              })}
              <line x1={0} x2={240} y1={12} y2={12} stroke={colors.profit} strokeDasharray="4 3" />
              <line x1={0} x2={240} y1={74} y2={74} stroke={colors.loss} strokeDasharray="4 3" />
            </svg>
            <div className="swatches">
              <span className="chip"><span className="swatch" style={{ background: colors.profit }} /> <span className="mono" style={{ color: colors.profit }}>+1,284.50</span></span>
              <span className="chip"><span className="swatch" style={{ background: colors.loss }} /> <span className="mono" style={{ color: colors.loss }}>-412.18</span></span>
              <span className="badge long">Long</span>
              <span className="badge short">Short</span>
            </div>
          </div>
        </Panel>

        <Panel title="Theme">
          <div className="col">
            <Segmented<Theme>
              value={theme}
              onChange={setTheme}
              ariaLabel="Theme"
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
            <span className="label">Light and dark are separately tuned palettes sharing token names.</span>
          </div>
        </Panel>

        <Panel title="Market data source" sub={<span className="row" style={{ gap: 4 }}><Database size={11} /> provider seam</span>}>
          <div className="col">
            <Segmented<ProviderId>
              value={providerId}
              onChange={(id) => useMarketStore.getState().setProvider(id)}
              ariaLabel="Market data source"
              options={[
                { value: 'mock', label: 'Simulated' },
                { value: 'live', label: 'Binance live' },
              ]}
            />
            <span className="label">
              Swaps the MarketDataProvider behind candles, order book and tickers without changing any UI. Live uses Binance public market data (no keys). Default comes from VITE_MARKET_DATA.
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
