import { useMemo, useState } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import { useOrderStore } from '@/stores/useOrderStore';
import { useFeeStore } from '@/stores/useFeeStore';
import { placeOrder, placeStopOrder } from '@/stores/trading';
import { equityNow, ticketSizeAt } from '@/stores/quickTrade';
import { positionSize, suggestedLevels } from '@/lib/trading/pnl';
import { feeFor } from '@/lib/account/fees';
import { tickSize } from '@/lib/mock/orderbook';
import { fmtPct, fmtPrice, fmtQty, fmtUsd } from '@/lib/format';
import { Segmented } from '@/components/ui/Segmented';
import type { Side } from '@/types';
import { BottomSheet } from '../BottomSheet';
import { Stepper, decimalsOf } from './Stepper';

type Kind = 'market' | 'limit' | 'stop';

/** Small step for a quantity: one tenth of its leading power of ten (0.04 → 0.001). */
export function qtyStep(q: number): number {
  if (!(q > 0)) return 0.001;
  return 10 ** (Math.floor(Math.log10(q)) - 1);
}

/** A quantity rounded to its step (0.801688 → 0.80), as the volume stepper shows it. */
export function roundQty(q: number): number {
  const st = qtyStep(q);
  return Number((Math.round(q / st) * st).toFixed(decimalsOf(st)));
}

/**
 * New order (MT5 "Trade" screen, TradingView's order panel): side, type (market / limit / stop),
 * volume stepper with equity presets, price for pending orders, SL / TP, cost and fee preview,
 * and one big confirm button.
 */
export function OrderSheet({ onClose, side: side0, type: type0, price: price0, symbol: sym0 }: { onClose: () => void; side?: Side; type?: Kind; price?: number; symbol?: string }) {
  const selected = useMarketStore((s) => s.selected);
  const symbol = sym0 ?? selected;
  const a = useMarketStore((s) => s.assets[symbol]);
  const ticket = useOrderStore.getState();
  const tier = useFeeStore((s) => s.tier);
  const [side, setSide] = useState<Side>(side0 ?? ticket.side);
  const [kind, setKind] = useState<Kind>(type0 ?? (price0 != null ? 'limit' : 'market'));
  const [qty, setQty] = useState(() => roundQty(ticketSizeAt(a.ask)));
  const [price, setPrice] = useState<number | null>(price0 ?? null);
  const [tp, setTp] = useState<number | null>(null);
  const [sl, setSl] = useState<number | null>(null);
  const [bracket, setBracket] = useState(ticket.bracket);
  const [error, setError] = useState<string | null>(null);

  const long = side === 'Long';
  const t = tickSize(a.price);
  // Pending price default: limit at the touch on its side, stop half a percent through the market.
  const defaultPx = kind === 'limit' ? (long ? a.bid : a.ask) : long ? a.ask * 1.005 : a.bid * 0.995;
  const px = price ?? Math.round(defaultPx / t) * t;
  const entry = kind === 'market' ? (long ? a.ask : a.bid) : px;
  const sug = suggestedLevels(side, entry);
  const tpV = tp ?? Math.round(sug.tp / t) * t;
  const slV = sl ?? Math.round(sug.sl / t) * t;
  const notional = qty * entry;
  const fee = feeFor(notional, tier, kind === 'limit' ? 'maker' : 'taker');
  const reward = Math.abs(tpV - entry) * qty;
  const risk = Math.abs(entry - slV) * qty;
  const step = qtyStep(qty || ticketSizeAt(a.ask));
  const pxStep = t * 10;
  const pxDec = decimalsOf(t);

  const presets = useMemo(() => [1, 5, 10, 25], []);
  const sizeFor = (pct: number) => roundQty(positionSize('pct', pct, equityNow(), entry).size);

  const submit = () => {
    setError(null);
    const common = { symbol, side, size: qty, tp: tpV, sl: slV, bracket };
    const r =
      kind === 'market'
        ? placeOrder({ ...common, orderType: 'market', maxSlippageBps: ticket.maxSlippageBps, source: 'ticket' })
        : kind === 'limit'
          ? placeOrder({ ...common, orderType: 'limit', limitPrice: px, tif: 'GTC', source: 'ticket' })
          : placeStopOrder({ ...common, triggerPrice: px, source: 'ticket' });
    if (r.ok) onClose();
    else setError(r.error);
  };

  const verb = long ? 'Buy' : 'Sell';
  return (
    <BottomSheet
      title={
        <span>
          {symbol}
          <span className="faint">/USDT</span>
        </span>
      }
      sub={
        <span className="mono">
          {fmtPrice(a.bid)} / {fmtPrice(a.ask)} · <span className={a.change24h >= 0 ? 'up' : 'down'}>{fmtPct(a.change24h)}</span>
        </span>
      }
      onClose={onClose}
      testId="m-order-sheet"
      footer={
        <button className={`m-confirm ${long ? 'buy' : 'sell'}`} onClick={submit} disabled={!(qty > 0)} data-testid="m-order-submit">
          {verb} {fmtQty(qty)} {symbol} {kind === 'market' ? 'at market' : `${kind} @ ${fmtPrice(px)}`}
        </button>
      }
    >
      <div className="m-side-toggle" role="group" aria-label="Side">
        <button className={`sell ${!long ? 'on' : ''}`} aria-pressed={!long} onClick={() => setSide('Short')} data-testid="m-side-sell">
          <span>Sell</span>
          <b className="mono">{fmtPrice(a.bid)}</b>
        </button>
        <button className={`buy ${long ? 'on' : ''}`} aria-pressed={long} onClick={() => setSide('Long')} data-testid="m-side-buy">
          <span>Buy</span>
          <b className="mono">{fmtPrice(a.ask)}</b>
        </button>
      </div>

      <Segmented<Kind>
        full
        value={kind}
        onChange={(k) => {
          setKind(k);
          setPrice(null);
        }}
        ariaLabel="Order type"
        options={[
          { value: 'market', label: 'Market' },
          { value: 'limit', label: 'Limit' },
          { value: 'stop', label: 'Stop' },
        ]}
      />

      <div className="m-field">
        <Stepper label={`Volume · ${symbol}`} value={qty} step={step} onChange={setQty} testId="m-qty" />
        <div className="m-chips">
          {presets.map((p) => (
            <button key={p} onClick={() => setQty(sizeFor(p))}>
              {p}%
            </button>
          ))}
        </div>
      </div>

      {kind !== 'market' && (
        <div className="m-field">
          <Stepper label={kind === 'limit' ? 'Limit price' : 'Stop price'} value={px} step={pxStep} onChange={setPrice} testId="m-price" decimals={pxDec} />
          <p className="m-hint">{kind === 'limit' ? `${verb} limit fills at ${fmtPrice(px)} or better (rests on the book).` : `${verb} stop goes in at market once the price trades ${long ? 'up to' : 'down to'} ${fmtPrice(px)}.`}</p>
        </div>
      )}

      <div className="m-field two">
        <Stepper label="Stop loss" value={slV} step={pxStep} onChange={setSl} testId="m-sl" decimals={pxDec} />
        <Stepper label="Take profit" value={tpV} step={pxStep} onChange={setTp} testId="m-tp" decimals={pxDec} />
      </div>
      <label className="m-toggle">
        <input type="checkbox" checked={bracket} onChange={(e) => setBracket(e.target.checked)} />
        <span>
          Send SL / TP as live orders <span className="faint">(OCO bracket)</span>
        </span>
      </label>

      <dl className="m-preview" data-testid="m-order-preview">
        <div>
          <dt>Cost</dt>
          <dd className="mono">{fmtUsd(notional)} USDT</dd>
        </div>
        <div>
          <dt>Fee ≈</dt>
          <dd className="mono">{fmtUsd(fee, 2)}</dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd className="mono down">−{fmtUsd(risk, 2)}</dd>
        </div>
        <div>
          <dt>Reward</dt>
          <dd className="mono up">+{fmtUsd(reward, 2)}</dd>
        </div>
      </dl>
      {error && (
        <p className="error-text" role="alert" data-testid="m-order-error">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}
