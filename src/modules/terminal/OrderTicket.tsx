import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Layers } from 'lucide-react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { NumericField } from '@/components/ui/NumericField';
import { usePositionStore } from '@/stores/usePositionStore';
import { flattenAll, placeOrder } from '@/stores/trading';
import { fmtPct, fmtPrice, fmtQty, fmtUsd, priceDecimals } from '@/lib/format';
import { pctFromEntry } from '@/lib/trading/pnl';
import type { OrderType, Side } from '@/types';
import type { SizingMode } from '@/lib/trading/pnl';
import { useTicket } from './useTicket';

export const PLACING_MS = 450;
export const PLACED_MS = 1400;
type Phase = 'idle' | 'placing' | 'placed';

export function OrderTicket({ drag }: { drag?: PanelDragProps }) {
  const t = useTicket();
  const hasPositions = usePositionStore((s) => s.positions.length > 0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [flattening, setFlattening] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const dec = priceDecimals(t.entry);

  const submit = () => {
    if (phase !== 'idle') return;
    setPhase('placing');
    timers.current.push(
      setTimeout(() => {
        const r = placeOrder({ symbol: t.symbol, side: t.side, orderType: t.orderType, size: t.size, limitPrice: t.limitPx, tp: t.tp, sl: t.sl });
        if (!r.ok) {
          setPhase('idle');
          return;
        }
        setPhase('placed');
        timers.current.push(setTimeout(() => setPhase('idle'), PLACED_MS));
      }, PLACING_MS),
    );
  };

  const tpPct = pctFromEntry(t.tp, t.entry);
  const slPct = pctFromEntry(t.sl, t.entry);
  const tpWrong = t.side === 'Long' ? t.tp <= t.entry : t.tp >= t.entry;
  const slWrong = t.side === 'Long' ? t.sl >= t.entry : t.sl <= t.entry;
  const insufficient = t.notional > t.balance + 1e-9;

  return (
    <Panel title="Order ticket" sub={`${t.symbol}/USDT`} drag={drag} testId="ticket">
      <div className="col ticket" style={{ gap: 12 }}>
        <Segmented<Side>
          full
          size="lg"
          ariaLabel="Side"
          value={t.side}
          onChange={t.setSide}
          thumbClassName={t.side === 'Long' ? 'long' : 'short'}
          className="side-seg"
          options={[
            { value: 'Long', label: 'Buy / Long' },
            { value: 'Short', label: 'Sell / Short' },
          ]}
        />
        <div className="row">
          <Segmented<OrderType>
            ariaLabel="Order type"
            value={t.orderType}
            onChange={t.setOrderType}
            options={[
              { value: 'market', label: 'Market' },
              { value: 'limit', label: 'Limit' },
            ]}
          />
          <span className="spacer" />
          <span className="label">Avail</span>
          <span className="num">{fmtUsd(t.balance)}</span>
        </div>

        {t.orderType === 'limit' ? (
          <div className="col" style={{ gap: 6 }}>
            <NumericField label="Limit price" value={t.limitPx} decimals={dec} onCommit={(v) => t.setLimitPrice(v > 0 ? v : null)} suffix="USDT" ariaLabel="Limit price" testId="limit-price" />
            <div className="row">
              <button className="btn sm grow" onClick={() => t.setLimitPrice(t.asset.bid)}>
                Best bid <span className="num up">{fmtPrice(t.asset.bid)}</span>
              </button>
              <button className="btn sm grow" onClick={() => t.setLimitPrice(t.asset.ask)}>
                Best ask <span className="num down">{fmtPrice(t.asset.ask)}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="ticket-market row">
            <span className="label">Est. fill</span>
            <span className="spacer" />
            <span className="num">{fmtPrice(t.entry)}</span>
          </div>
        )}

        <div className="col" style={{ gap: 6 }}>
          <div className="row">
            <span className="label">Risk sizing</span>
            <span className="spacer" />
            <Segmented<SizingMode>
              ariaLabel="Sizing mode"
              value={t.sizingMode}
              onChange={t.setSizingMode}
              options={[
                { value: 'pct', label: '% of equity' },
                { value: 'usdt', label: 'USDT' },
              ]}
            />
          </div>
          <NumericField
            value={t.sizingValue}
            onCommit={t.setSizingValue}
            suffix={t.sizingMode === 'pct' ? '%' : 'USDT'}
            ariaLabel={t.sizingMode === 'pct' ? 'Percent of equity' : 'USDT value'}
            testId="sizing-value"
          />
          {t.sizingMode === 'pct' && (
            <div className="row" style={{ gap: 4 }}>
              {[5, 10, 25, 50].map((p) => (
                <button key={p} className={`btn sm grow ${t.pctValue === p ? 'active' : ''}`} onClick={() => t.setSizingValue(p)}>
                  {p}%
                </button>
              ))}
            </div>
          )}
          <div className="ticket-summary">
            <div className="row">
              <span className="label">Size</span>
              <span className="spacer" />
              <span className="num" data-testid="ticket-size">{fmtQty(t.size)} {t.symbol}</span>
            </div>
            <div className="row">
              <span className="label">Notional</span>
              <span className="spacer" />
              <span className={`num ${insufficient ? 'down' : ''}`}>{fmtUsd(t.notional)} USDT</span>
            </div>
          </div>
        </div>

        <div className="ticket-levels">
          <NumericField
            label="Take profit"
            value={t.tp}
            decimals={dec}
            onCommit={(v) => t.setTp(v)}
            ariaLabel="Take profit"
            testId="tp-input"
            hint={<span className={tpWrong ? 'down' : 'up'}>{fmtPct(tpPct)} from entry</span>}
          />
          <NumericField
            label="Stop loss"
            value={t.sl}
            decimals={dec}
            onCommit={(v) => t.setSl(v)}
            ariaLabel="Stop loss"
            testId="sl-input"
            hint={<span className={slWrong ? 'up' : 'down'}>{fmtPct(slPct)} from entry</span>}
          />
        </div>
        <div className="row">
          <button className="btn sm ghost" onClick={t.resetLevels} disabled={t.tp === t.suggested.tp && t.sl === t.suggested.sl}>
            <RotateCcw size={12} /> Reset to suggested
          </button>
          <span className="spacer" />
          {(tpWrong || slWrong) && <span className="error-text">{tpWrong ? 'TP' : 'SL'} is on the wrong side of entry</span>}
        </div>

        <button
          className={`btn lg primary place-btn ${phase}`}
          onClick={submit}
          disabled={phase !== 'idle' || !(t.size > 0) || insufficient || tpWrong || slWrong}
          data-testid="place-order"
        >
          {phase === 'placing' ? (
            <>
              <Loader2 size={15} className="spin" /> Placing order…
            </>
          ) : phase === 'placed' ? (
            <>
              <Check size={15} /> Order placed
            </>
          ) : (
            <>
              {t.side === 'Long' ? 'Buy' : 'Sell'} {t.orderType === 'market' ? 'market' : 'limit'} · {fmtQty(t.size)} {t.symbol}
            </>
          )}
        </button>
        {insufficient && <span className="error-text">Notional exceeds available balance</span>}

        {hasPositions && (
          <button
            className="btn danger"
            disabled={flattening}
            data-testid="flatten-all"
            onClick={async () => {
              setFlattening(true);
              await flattenAll();
              setFlattening(false);
            }}
          >
            {flattening ? <Loader2 size={13} className="spin" /> : <Layers size={13} />} Flatten all
          </button>
        )}
      </div>
    </Panel>
  );
}
