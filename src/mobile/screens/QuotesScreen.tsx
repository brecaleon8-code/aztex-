import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreHorizontal, Rows3, Columns2 } from 'lucide-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtPct, fmtPrice, fmtTime } from '@/lib/format';
import { Sparkline } from '@/components/ui/Sparkline';
import { useSpark } from '@/modules/terminal/useSpark';
import { useMobileStore } from '../useMobileStore';
import { MHeader } from '../MobileApp';

const NAMES = Object.fromEntries(ASSET_UNIVERSE.map((a) => [a.symbol, a.name]));

/**
 * Quotes: TradingView's watchlist (symbol, sparkline, price, change pill) or, toggled, MT5's
 * bid / ask boxes with the last digits enlarged. Tap a row for its chart; ⋯ for actions.
 */
export function QuotesScreen() {
  const watchlist = useMarketStore((s) => s.watchlist);
  const mode = useMobileStore((s) => s.quotesMode);
  const { open, setQuotesMode } = useMobileStore.getState();
  return (
    <div className="m-page">
      <MHeader
        title="Quotes"
        sub={`${watchlist.length} symbols`}
        left={
          <button className="m-icon-btn" onClick={() => setQuotesMode(mode === 'simple' ? 'bidask' : 'simple')} aria-label={mode === 'simple' ? 'Show bid / ask' : 'Show prices'} title="Switch view" data-testid="m-quotes-mode">
            {mode === 'simple' ? <Columns2 size={19} /> : <Rows3 size={19} />}
          </button>
        }
        right={
          <button className="m-icon-btn" onClick={() => open({ kind: 'symbol', purpose: 'watch' })} aria-label="Add symbol" data-testid="m-add-symbol">
            <Plus size={21} />
          </button>
        }
      />
      <div className="m-scroll">
        <ul className={`m-quotes ${mode}`} data-testid="m-quotes">
          {watchlist.map((s) => (mode === 'simple' ? <SimpleRow key={s} symbol={s} /> : <BidAskRow key={s} symbol={s} />))}
        </ul>
        {watchlist.length === 0 && <div className="empty">Your watchlist is empty — tap + to add symbols.</div>}
      </div>
    </div>
  );
}

function useOpenChart(symbol: string) {
  const navigate = useNavigate();
  return () => {
    useMarketStore.getState().select(symbol);
    navigate('/terminal');
  };
}

/** Colours the price by the direction of its last tick (MT5 style). */
function useTickDir(price: number | undefined) {
  const last = useRef<{ p?: number; dir: 'up' | 'down' | '' }>({ dir: '' });
  if (price != null && last.current.p != null && price !== last.current.p) last.current.dir = price > last.current.p ? 'up' : 'down';
  last.current.p = price;
  return last.current.dir;
}

function SimpleRow({ symbol }: { symbol: string }) {
  const a = useMarketStore((s) => s.assets[symbol]);
  const colors = useThemeStore((s) => s.colors);
  const spark = useSpark(symbol);
  const openChart = useOpenChart(symbol);
  if (!a) return null;
  return (
    <li className="m-quote" data-testid={`m-quote-${symbol}`}>
      <button className="m-quote-main" onClick={openChart}>
        <span className="m-q-badge">{symbol.slice(0, 1)}</span>
        <span className="m-q-name">
          <b>{symbol}</b>
          <span>{NAMES[symbol]}</span>
        </span>
        <Sparkline values={spark.values} width={58} height={24} up={colors.profit} down={colors.loss} />
        <span className="m-q-px">
          <span className="mono">{fmtPrice(a.price)}</span>
          <span className={`m-pill ${a.change24h >= 0 ? 'up' : 'down'}`}>{fmtPct(a.change24h)}</span>
        </span>
      </button>
      <button className="m-q-more" onClick={() => useMobileStore.getState().open({ kind: 'quote', symbol })} aria-label={`${symbol} actions`} data-testid={`m-quote-more-${symbol}`}>
        <MoreHorizontal size={18} />
      </button>
    </li>
  );
}

/** "62,470.12" → "62,470." + big "12": the digits that move, emphasised like MT5's pips. */
function Digits({ v }: { v: number }) {
  const s = fmtPrice(v);
  return (
    <span className="m-digits mono">
      {s.slice(0, -2)}
      <b>{s.slice(-2)}</b>
    </span>
  );
}

function BidAskRow({ symbol }: { symbol: string }) {
  const a = useMarketStore((s) => s.assets[symbol]);
  const spark = useSpark(symbol);
  const dir = useTickDir(a?.price);
  const openChart = useOpenChart(symbol);
  if (!a) return null;
  const spread = a.ask - a.bid;
  return (
    <li className="m-quote ba" data-testid={`m-quote-${symbol}`}>
      <button className="m-quote-main" onClick={openChart}>
        <span className="m-q-name">
          <b>{symbol}</b>
          <span className={a.change24h >= 0 ? 'up' : 'down'}>{fmtPct(a.change24h)}</span>
          <span className="faint mono" title="Spread · last update">
            {fmtPrice(spread)} · {fmtTime(Date.now(), false)}
          </span>
        </span>
        <span className={`m-ba bid ${dir}`}>
          <span className="m-ba-label">Bid</span>
          <Digits v={a.bid} />
          <span className="m-ba-sub mono">L {spark.low != null ? fmtPrice(spark.low) : '—'}</span>
        </span>
        <span className={`m-ba ask ${dir}`}>
          <span className="m-ba-label">Ask</span>
          <Digits v={a.ask} />
          <span className="m-ba-sub mono">H {spark.high != null ? fmtPrice(spark.high) : '—'}</span>
        </span>
      </button>
      <button className="m-q-more" onClick={() => useMobileStore.getState().open({ kind: 'quote', symbol })} aria-label={`${symbol} actions`}>
        <MoreHorizontal size={18} />
      </button>
    </li>
  );
}
