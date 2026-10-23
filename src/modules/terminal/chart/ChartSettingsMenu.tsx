import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, Trash2, SquareCode, X } from 'lucide-react';
import { useUiStore } from '@/stores/useUiStore';
import { useThemeStore, DEFAULT_COLORS, type Theme } from '@/stores/useThemeStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useChartStore } from '@/stores/useChartStore';
import { Segmented } from '@/components/ui/Segmented';
import { openStudio } from '@/app/studioLauncher';
import type { AppearanceColors, ChartMode } from '@/types';
import type { ProviderId } from '@/lib/data';

const PICKERS: { key: keyof AppearanceColors; label: string; hint: string }[] = [
  { key: 'bull', label: 'Bullish candle', hint: 'Up candles, volume' },
  { key: 'bear', label: 'Bearish candle', hint: 'Down candles, volume' },
  { key: 'profit', label: 'Take-profit / profit', hint: 'TP line, positive P/L' },
  { key: 'loss', label: 'Stop-loss / loss', hint: 'SL line, negative P/L' },
];

/** One-click candle palettes; P/L follows the candle pair so the chart reads as one system. */
export const COLOR_PRESETS: { id: string; label: string; colors: AppearanceColors }[] = [
  { id: 'aztex', label: 'Aztex', colors: DEFAULT_COLORS },
  { id: 'classic', label: 'Classic', colors: { bull: '#26A69A', bear: '#EF5350', profit: '#26A69A', loss: '#EF5350' } },
  { id: 'cb', label: 'Colour-blind', colors: { bull: '#3B82F6', bear: '#F59E0B', profit: '#3B82F6', loss: '#F59E0B' } },
  { id: 'mono', label: 'Mono', colors: { bull: '#D4D6DA', bear: '#6B7079', profit: '#D4D6DA', loss: '#8A8F97' } },
];

const MODES: { value: ChartMode; label: string }[] = [
  { value: 'candles', label: 'Candles' },
  { value: 'heikin', label: 'Heikin-Ashi' },
  { value: 'bars', label: 'OHLC bars' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'renko', label: 'Renko' },
  { value: 'footprint', label: 'Footprint' },
];

const same = (a: AppearanceColors, b: AppearanceColors) => (Object.keys(a) as (keyof AppearanceColors)[]).every((k) => a[k].toLowerCase() === b[k].toLowerCase());

/**
 * Chart settings, MT5 "Properties" style: right-click any chart, use the chart's gear, or press F8.
 * Candle/P&L colours, chart type, overlays, theme and the market-data feed — all applied live.
 */
export function ChartSettingsMenu() {
  const at = useUiStore((s) => s.chartMenu);
  const close = useUiStore((s) => s.closeChartMenu);
  const { drawings, clearDrawings } = useChartStore();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Keep the whole menu on screen: flip left/up from the click point when it would overflow.
  useLayoutEffect(() => {
    if (!at || !ref.current) {
      setPos(null);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = at.x + r.width + 8 > vw ? Math.max(8, at.x - r.width) : at.x;
    const top = Math.max(8, Math.min(at.y, vh - r.height - 8));
    setPos({ left, top });
  }, [at]);

  useEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [at, close]);

  if (!at) return null;
  return createPortal(
    <div
      ref={ref}
      className="chart-menu"
      role="dialog"
      aria-label="Chart settings"
      style={pos ? { left: pos.left, top: pos.top } : { left: at.x, top: at.y, visibility: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="chart-settings-menu"
    >
      <div className="cm-head">
        <span className="cm-title">Chart settings</span>
        <kbd className="cm-kbd">F8</kbd>
        <span className="spacer" />
        <button className="btn sm icon ghost" onClick={close} aria-label="Close chart settings">
          <X size={13} />
        </button>
      </div>

      <ChartSettingsSections />

      <div className="cm-section cm-actions">
        <button className="menu-item" onClick={clearDrawings} disabled={drawings.length === 0}>
          <Trash2 size={13} /> <span className="grow">Clear drawings</span>
          <span className="mono faint">{drawings.length || ''}</span>
        </button>
        <button
          className="menu-item"
          onClick={() => {
            close();
            openStudio();
          }}
        >
          <SquareCode size={13} /> <span className="grow">Open Aztex Studio</span>
          <kbd className="cm-kbd">F4</kbd>
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** The settings themselves — shared by the desktop popover and the phone's bottom sheet. */
export function ChartSettingsSections() {
  const { colors, setColor, resetColors, theme, setTheme } = useThemeStore();
  const providerId = useMarketStore((s) => s.providerId);
  const { mode, setMode, profile, toggleProfile, bookProfile, toggleBookProfile } = useChartStore();
  return (
    <>
      <div className="cm-section">
        <label className="cm-row">
          <span className="cm-label">Chart type</span>
          <select className="input cm-select" value={mode} onChange={(e) => setMode(e.target.value as ChartMode)} aria-label="Chart type" data-testid="ctx-chart-type">
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="cm-section">
        <div className="cm-group">
          Colours
          <button className="cm-link" onClick={resetColors} disabled={same(colors, DEFAULT_COLORS)} data-testid="reset-colors">
            <RotateCcw size={11} /> Reset
          </button>
        </div>
        {PICKERS.map((p) => (
          <label key={p.key} className="cm-color" title={p.hint}>
            <span className="cm-swatch">
              <input type="color" value={colors[p.key]} onChange={(e) => setColor(p.key, e.target.value)} aria-label={p.label} data-testid={`color-${p.key}`} />
            </span>
            <span className="grow">{p.label}</span>
            <span className="mono faint cm-hex">{colors[p.key].toUpperCase()}</span>
          </label>
        ))}
        <div className="cm-presets" role="group" aria-label="Colour presets">
          {COLOR_PRESETS.map((pr) => {
            const on = same(colors, pr.colors);
            return (
              <button
                key={pr.id}
                className={`cm-preset ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => useThemeStore.getState().setColors(pr.colors)}
                title={`${pr.label} palette`}
                data-testid={`preset-${pr.id}`}
              >
                <span className="cm-pair">
                  <i style={{ background: pr.colors.bull }} />
                  <i style={{ background: pr.colors.bear }} />
                </span>
                {pr.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cm-section">
        <div className="cm-group">Display</div>
        <button className="cm-check" role="menuitemcheckbox" aria-checked={profile} onClick={toggleProfile}>
          <span className={`check ${profile ? 'on' : ''}`}>{profile && <Check size={11} />}</span> Volume profile
        </button>
        <button className="cm-check" role="menuitemcheckbox" aria-checked={bookProfile} onClick={toggleBookProfile}>
          <span className={`check ${bookProfile ? 'on' : ''}`}>{bookProfile && <Check size={11} />}</span> Order-book profile
        </button>
        <div className="cm-row">
          <span className="cm-label">Theme</span>
          <Segmented<Theme>
            value={theme}
            onChange={setTheme}
            ariaLabel="Theme"
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </div>
        <div className="cm-row">
          <span className="cm-label">Data feed</span>
          <Segmented<ProviderId>
            value={providerId}
            onChange={(id) => useMarketStore.getState().setProvider(id)}
            ariaLabel="Market data source"
            options={[
              { value: 'mock', label: 'Simulated' },
              { value: 'live', label: 'Binance live' },
            ]}
          />
        </div>
      </div>
    </>
  );
}
