import { useEffect } from 'react';
import { ChevronDown, FunctionSquare, PencilRuler, Settings2, X, Eye, EyeOff } from 'lucide-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { useChartStore } from '@/stores/useChartStore';
import { indicatorLabel } from '@/lib/indicators/compute';
import { fmtPct, fmtPrice, fmtQty } from '@/lib/format';
import { ticketSizeAt } from '@/stores/quickTrade';
import { roundQty } from '../sheets/OrderSheet';
import { useTickFlash } from '@/app/useTickFlash';
import { PriceChart } from '@/modules/terminal/chart/PriceChart';
import { QuickEdit } from '@/modules/terminal/chart/QuickEdit';
import type { DrawingTool, Timeframe } from '@/types';
import { useMobileStore } from '../useMobileStore';
import '@/modules/terminal/chart/chart.css';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const TOOL_NAMES: Partial<Record<DrawingTool, string>> = {
  trend: 'Trend line · tap two points',
  ray: 'Horizontal line · tap a price',
  fib: 'Fib · tap two points',
  rect: 'Rectangle · tap two corners',
  brush: 'Brush · draw with your finger',
  text: 'Text · tap where it goes',
  measure: 'Measure · drag or tap two points',
  zoom: 'Zoom · drag across bars',
};

/**
 * Full-screen chart (TradingView app): symbol and timeframe up top, indicators / drawing tools /
 * settings as sheets, and MT5's Sell | Buy bar at the bottom. Drag to pan, pinch to zoom,
 * long-press for the crosshair.
 */
export function ChartScreen() {
  const symbol = useMarketStore((s) => s.selected);
  const tf = useMarketStore((s) => s.timeframe);
  const asset = useMarketStore((s) => s.assets[s.selected]);
  const { indicators, tool, setTool, openEditor, toggleIndicatorHidden, removeIndicator } = useChartStore();
  const open = useMobileStore((s) => s.open);
  const flash = useTickFlash(asset.price);
  const size = ticketSizeAt(asset.ask);

  // Drawings belong to a symbol/timeframe, as on desktop.
  useEffect(() => {
    useChartStore.getState().switchDrawings(`${symbol}:${tf}`);
  }, [symbol, tf]);

  return (
    <div className="m-page m-chart-page" data-testid="m-chart">
      <header className="m-chart-head">
        <button className="m-sym-btn" onClick={() => open({ kind: 'symbol', purpose: 'chart' })} data-testid="m-symbol">
          <span className="m-sym">
            {symbol}
            <span className="faint">/USDT</span>
            <ChevronDown size={15} />
          </span>
          <span className="m-sym-px">
            <span className={`mono ${flash.cls}`} key={flash.key}>
              {fmtPrice(asset.price)}
            </span>
            <span className={asset.change24h >= 0 ? 'up' : 'down'}>{fmtPct(asset.change24h)}</span>
          </span>
        </button>
        <span className="spacer" />
        <button className="m-icon-btn" onClick={() => open({ kind: 'indicators' })} aria-label="Indicators" data-testid="m-indicators">
          <FunctionSquare size={20} />
        </button>
        <button className={`m-icon-btn ${tool !== 'cursor' ? 'on' : ''}`} onClick={() => open({ kind: 'tools' })} aria-label="Drawing tools" data-testid="m-tools">
          <PencilRuler size={19} />
        </button>
        <button className="m-icon-btn" onClick={() => open({ kind: 'chart-settings' })} aria-label="Chart settings" data-testid="m-chart-settings">
          <Settings2 size={19} />
        </button>
      </header>

      <div className="m-tf-row" role="group" aria-label="Timeframe">
        {TIMEFRAMES.map((t) => (
          <button key={t} className={`m-tf ${t === tf ? 'on' : ''}`} aria-pressed={t === tf} onClick={() => useMarketStore.getState().setTimeframe(t)} data-testid={`m-tf-${t}`}>
            {t}
          </button>
        ))}
        {indicators.length > 0 && <span className="m-tf-sep" />}
        {indicators.map((i) => (
          <span key={i.id} className={`m-ind ${i.hidden ? 'off' : ''}`} data-qe-anchor>
            <button className="m-ind-main" onClick={(e) => openEditor(i.id, e.currentTarget.parentElement!)}>
              <i style={{ background: i.color }} />
              {indicatorLabel(i)}
            </button>
            <button onClick={() => toggleIndicatorHidden(i.id)} aria-label={`${i.hidden ? 'Show' : 'Hide'} ${indicatorLabel(i)}`}>
              {i.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            <button onClick={() => removeIndicator(i.id)} aria-label={`Remove ${indicatorLabel(i)}`}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <div className="m-chart-body">
        {tool !== 'cursor' && (
          <div className="m-tool-pill" data-testid="m-tool-pill">
            {TOOL_NAMES[tool]}
            <button onClick={() => setTool('cursor')} aria-label="Done drawing">
              <X size={14} />
            </button>
          </div>
        )}
        <PriceChart fill />
      </div>

      <div className="m-trade-bar" data-testid="m-trade-bar">
        <button className="m-trade sell" onClick={() => open({ kind: 'order', side: 'Short' })} data-testid="m-sell">
          <span>Sell</span>
          <b className="mono">{fmtPrice(asset.bid)}</b>
        </button>
        <button className="m-trade-qty mono" onClick={() => open({ kind: 'order' })} aria-label="New order">
          {fmtQty(roundQty(size))}
          <span>{symbol}</span>
        </button>
        <button className="m-trade buy" onClick={() => open({ kind: 'order', side: 'Long' })} data-testid="m-buy">
          <span>Buy</span>
          <b className="mono">{fmtPrice(asset.ask)}</b>
        </button>
      </div>
      <QuickEdit />
    </div>
  );
}
