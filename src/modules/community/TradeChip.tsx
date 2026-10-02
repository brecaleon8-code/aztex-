import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { TradeChipData } from '@/types';
import { useMarketStore } from '@/stores/useMarketStore';
import { fmtPct, fmtPrice } from '@/lib/format';
import { pnlPct } from '@/lib/trading/pnl';

/** Shared-trade bubble: symbol, side, entry/current, live P/L %, TP/SL. Click opens the chart. */
export function TradeChip({ trade, compact }: { trade: TradeChipData; compact?: boolean }) {
  const current = useMarketStore((s) => s.assets[trade.symbol]?.price ?? trade.entry);
  const navigate = useNavigate();
  const pct = pnlPct(trade.side, trade.entry, current);
  return (
    <button
      className={`trade-chip ${compact ? 'compact' : ''}`}
      onClick={() => {
        useMarketStore.getState().select(trade.symbol);
        navigate('/terminal');
      }}
      title="Open on chart"
      data-testid="trade-chip"
    >
      <div className="row">
        <span className="mono" style={{ fontWeight: 600 }}>{trade.symbol}</span>
        <span className={`badge ${trade.side === 'Long' ? 'long' : 'short'}`}>{trade.side}</span>
        <span className="spacer" />
        <span className={`num ${pct >= 0 ? 'up' : 'down'}`} data-testid="trade-chip-pnl">{fmtPct(pct)}</span>
        <ArrowUpRight size={12} className="faint" />
      </div>
      <div className="trade-chip-grid">
        <span className="label">Entry</span>
        <span className="num">{fmtPrice(trade.entry)}</span>
        <span className="label">Now</span>
        <span className="num">{fmtPrice(current)}</span>
        {trade.tp != null && (
          <>
            <span className="label">TP</span>
            <span className="num up">{fmtPrice(trade.tp)}</span>
          </>
        )}
        {trade.sl != null && (
          <>
            <span className="label">SL</span>
            <span className="num down">{fmtPrice(trade.sl)}</span>
          </>
        )}
      </div>
    </button>
  );
}
