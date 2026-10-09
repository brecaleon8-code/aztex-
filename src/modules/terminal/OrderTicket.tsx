import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Layers, AlertTriangle, Ban } from 'lucide-react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { NumericField } from '@/components/ui/NumericField';
import { usePositionStore } from '@/stores/usePositionStore';
import { flattenAll, placeOrder, startTwap } from '@/stores/trading';
import type { ExecPreview } from '@/lib/trading/execution';
import { fmtPct, fmtPrice, fmtQty, fmtUsd, priceDecimals } from '@/lib/format';
import { pctFromEntry } from '@/lib/trading/pnl';
import { riskReward, type RiskReward } from '@/lib/trading/risk';
import { FEE_TIERS } from '@/lib/account/fees';
import { useFeeStore } from '@/stores/useFeeStore';
import type { OrderType, Side, TimeInForce } from '@/types';
import type { SizingMode } from '@/lib/trading/pnl';
import { useTicketPreview } from './useTicket';
import { useMarketStore } from '@/stores/useMarketStore';

export const PLACING_MS = 450;
export const PLACED_MS = 1400;
type Phase = 'idle' | 'placing' | 'placed';

export function OrderTicket({ drag }: { drag?: PanelDragProps }) {
  // Priced on every book update with the same model the router fills with.
  const { t, req, pv } = useTicketPreview();
  const hasPositions = usePositionStore((s) => s.positions.length > 0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [flattening, setFlattening] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const dec = priceDecimals(t.entry);
  const twap = t.orderType === 'market' && t.exec === 'twap';
  const tier = useFeeStore((s) => s.tier);
  const estFee = pv.takerFee + pv.makerFee;

  const submit = () => {
    if (phase !== 'idle') return;
    setPhase('placing');
    timers.current.push(
      setTimeout(() => {
        const r =
          twap
            ? startTwap({ symbol: t.symbol, side: t.side, size: t.size, durationMs: t.twapMinutes * 60_000, slices: t.twapSlices, tp: t.tp, sl: t.sl, bracket: t.bracket })
            : placeOrder(req);
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
  const insufficient = !t.reduceOnly && (twap ? t.notional : pv.required) > t.balance + 1e-9;
  const exitsOn = !t.reduceOnly;

  return (
    <Panel code="EMSX" title="Order Ticket" sub={`${t.symbol}/USDT`} drag={drag} testId="ticket">
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
            <div className="row">
              <span className="label" title="Time in force: GTC rests until filled or cancelled · IOC fills what it can now and cancels the rest · FOK fills completely now or not at all">
                TIF
              </span>
              <Segmented<TimeInForce>
                ariaLabel="Time in force"
                value={t.tif}
                onChange={t.setTif}
                options={[
                  { value: 'GTC', label: 'GTC', title: 'Good till cancelled — the unfilled part rests on the book' },
                  { value: 'IOC', label: 'IOC', title: 'Immediate or cancel — fill what you can now, cancel the rest' },
                  { value: 'FOK', label: 'FOK', title: 'Fill or kill — fill completely now, or not at all' },
                ]}
              />
              <span className="spacer" />
              <Toggle on={t.postOnly} onChange={(v) => t.setFlag('postOnly', v)} label="Post-only" title="Maker-only: rejected instead of taking liquidity if it would cross the spread" testId="post-only" />
            </div>
          </div>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            <div className="row">
              <span className="label">Execution</span>
              <span className="spacer" />
              <Segmented<'direct' | 'twap'>
                ariaLabel="Execution"
                value={t.exec}
                onChange={t.setExec}
                options={[
                  { value: 'direct', label: 'Direct' },
                  { value: 'twap', label: 'TWAP' },
                ]}
              />
            </div>
            {twap && (
              <div className="ticket-levels">
                <NumericField label="Duration (min)" value={t.twapMinutes} min={1} onCommit={(v) => t.setTwap({ minutes: v })} ariaLabel="TWAP duration" testId="twap-minutes" />
                <NumericField label="Slices" value={t.twapSlices} min={2} onCommit={(v) => t.setTwap({ slices: Math.round(v) })} ariaLabel="TWAP slices" testId="twap-slices" />
              </div>
            )}
            {twap ? (
              <div className="ticket-market row">
                <span className="label">Arrival px</span>
                <span className="spacer" />
                <span className="num">{fmtPrice(t.entry)}</span>
                <span className="num faint">· child {fmtQty(t.size / Math.max(2, t.twapSlices))} / {((t.twapMinutes * 60) / Math.max(2, t.twapSlices)).toFixed(0)}s</span>
              </div>
            ) : (
              <div className="row">
                <span className="label" title="Market orders stop filling beyond this distance from the best price; the rest is cancelled">
                  Slippage limit
                </span>
                <span className="spacer" />
                <input
                  className="input mono slip-input"
                  type="number"
                  min={1}
                  max={1000}
                  value={t.maxSlippageBps}
                  onChange={(e) => Number.isFinite(e.target.valueAsNumber) && t.setMaxSlippage(e.target.valueAsNumber)}
                  aria-label="Max slippage in basis points"
                  data-testid="max-slippage"
                />
                <span className="label">bp</span>
              </div>
            )}
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
          <div className="row ticket-flags">
            <Toggle on={t.reduceOnly} onChange={(v) => t.setFlag('reduceOnly', v)} label="Reduce-only" title={`Only closes existing ${t.side === 'Long' ? 'short' : 'long'} ${t.symbol} exposure — never opens or flips a position`} testId="reduce-only" />
            <Toggle on={t.bracket && exitsOn} disabled={!exitsOn} onChange={(v) => t.setFlag('bracket', v)} label="Bracket TP/SL" title="Send take-profit (limit) and stop-loss (stop-market) as live one-cancels-other exit orders. Off: TP/SL are alerts only." testId="bracket" />
          </div>
          <div className="ticket-summary">
            <div className="row">
              <span className="label">Size</span>
              <span className="spacer" />
              <span className="num" data-testid="ticket-size">{fmtQty(t.reduceOnly ? pv.qty : t.size)} {t.symbol}</span>
            </div>
            <div className="row">
              <span className="label">Notional</span>
              <span className="spacer" />
              <span className={`num ${insufficient ? 'down' : ''}`}>{fmtUsd(twap || !pv.ok ? t.notional : pv.notional)} USDT</span>
            </div>
            {twap ? (
              <div className="row">
                <span className="label">Est. fee · {FEE_TIERS[tier].label} taker</span>
                <span className="spacer" />
                <span className="num" data-testid="ticket-fee">{fmtUsd(t.notional * FEE_TIERS[tier].taker)} USDT</span>
              </div>
            ) : (
              <PreTrade pv={pv} tierLabel={FEE_TIERS[tier].label} symbol={t.symbol} estFee={estFee} />
            )}
          </div>
        </div>

        {exitsOn ? (
        <>
        <div className="ticket-levels">
          <NumericField
            label={t.bracket ? 'Take profit · limit' : 'TP alert'}
            value={t.tp}
            decimals={dec}
            onCommit={(v) => t.setTp(v)}
            ariaLabel="Take profit"
            testId="tp-input"
            hint={<span className={tpWrong ? 'down' : 'up'}>{fmtPct(tpPct)} from entry</span>}
          />
          <NumericField
            label={t.bracket ? 'Stop loss · stop' : 'SL alert'}
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

        <RiskPanel risk={riskReward(t.side, t.entry, t.tp, t.sl, t.size, t.equity)} />
        </>
        ) : (
          <div className="ticket-note" data-testid="reduce-note">
            Reduce-only closes {t.side === 'Long' ? 'short' : 'long'} {t.symbol} exposure (oldest first). No exit orders are attached.
          </div>
        )}

        <button
          className={`btn lg primary place-btn ${phase} ${t.side === 'Long' ? 'long' : 'short'}`}
          onClick={submit}
          disabled={phase !== 'idle' || !(t.size > 0) || insufficient || (exitsOn && (tpWrong || slWrong)) || (!twap && !pv.ok)}
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
              {twap ? 'Start TWAP' : t.side === 'Long' ? 'Buy' : 'Sell'} {twap ? (t.side === 'Long' ? 'buy' : 'sell') : t.orderType === 'market' ? 'market' : 'limit'}
              {!twap && t.orderType === 'limit' && t.tif !== 'GTC' ? ` ${t.tif}` : ''}
              {!twap && t.orderType === 'limit' && t.postOnly ? ' · post-only' : ''}
              {t.reduceOnly ? ' · reduce-only' : ''} · {fmtQty(t.reduceOnly ? pv.qty : t.size)} {t.symbol}
            </>
          )}
        </button>
        {insufficient && <span className="error-text">Notional + fees exceed available balance</span>}

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

/** Pre-trade risk readout: what the stop costs, what the target pays, and the ratio between them. */
function RiskPanel({ risk }: { risk: RiskReward }) {
  const rr = risk.rr;
  const pct = rr == null ? 0 : Math.min(100, (rr / (rr + 1)) * 100);
  return (
    <div className="risk-panel" data-testid="risk-panel">
      <div className="risk-bar" aria-hidden>
        <span className="risk-bar-loss" style={{ width: `${100 - pct}%` }} />
        <span className="risk-bar-gain" style={{ width: `${pct}%` }} />
      </div>
      <div className="risk-grid">
        <div>
          <span className="label">Max loss</span>
          <span className="num down">-{fmtUsd(risk.risk)}</span>
        </div>
        <div>
          <span className="label">Target</span>
          <span className="num up">+{fmtUsd(risk.reward)}</span>
        </div>
        <div>
          <span className="label">R:R</span>
          <span className="num" data-testid="risk-rr">{rr == null ? '—' : `${rr.toFixed(2)}`}</span>
        </div>
        <div>
          <span className="label">Risk / equity</span>
          <span className={`num ${risk.riskPct > 2 ? 'warn-text' : ''}`}>{risk.riskPct.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label, title, testId, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; title?: string; testId?: string; disabled?: boolean }) {
  return (
    <button type="button" className={`tk-toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(!on)} title={title} data-testid={testId} disabled={disabled}>
      <span className="tk-box" aria-hidden>
        {on && <Check size={10} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

const fmtBp = (v: number) => (Math.abs(v) < 0.05 ? '0.0 bp' : `${v >= 0 ? '' : '−'}${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))} bp`);

/** What the order would do right now against the visible book: price, slippage, fees, depth consumed. */
function PreTrade({ pv, tierLabel, symbol, estFee }: { pv: ExecPreview; tierLabel: string; symbol: string; estFee: number }) {
  const t = pv.take;
  return (
    <div className="pretrade" data-testid="exec-preview">
      {t.filled > 0 && (
        <>
          <div className="row">
            <span className="label">Est. avg price</span>
            <span className="spacer" />
            <span className="num" data-testid="exec-avg">
              {fmtPrice(t.avgPx!)}
            </span>
          </div>
          <div className="row">
            <span className="label">Worst · levels</span>
            <span className="spacer" />
            <span className="num">
              {fmtPrice(t.worstPx!)} · {t.levels}
              {t.beyondBook ? '+' : ''}
            </span>
          </div>
          <div className="row">
            <span className="label" title="Average fill vs best price (touch). Impact adds the half-spread (vs mid).">
              Slippage · impact
            </span>
            <span className="spacer" />
            <span className={`num ${pv.slippageBps > 5 ? 'warn-text' : ''}`} data-testid="exec-slippage">
              {fmtBp(pv.slippageBps)} · {fmtBp(pv.impactBps)}
            </span>
          </div>
          <DepthUse pv={pv} />
        </>
      )}
      {pv.restQty > 0 && pv.restPx != null && (
        <div className="row">
          <span className="label">Rests on book</span>
          <span className="spacer" />
          <span className="num">
            {fmtQty(pv.restQty)} {symbol} @ {fmtPrice(pv.restPx)}
          </span>
        </div>
      )}
      <div className="row">
        <span className="label">
          Est. fee · {tierLabel} {pv.liquidity === 'none' ? '' : pv.liquidity}
        </span>
        <span className="spacer" />
        <span className={`num ${estFee < 0 ? 'up' : ''}`} data-testid="ticket-fee">
          {estFee < 0 ? `+${fmtUsd(-estFee)} rebate` : `${fmtUsd(estFee)} USDT`}
        </span>
      </div>
      <div className="row">
        <span className="label">Spread</span>
        <span className="spacer" />
        <span className="num faint">{fmtBp(pv.spreadBps)}</span>
      </div>
      {pv.warnings.map((w) => (
        <div key={w} className="pt-warn">
          <AlertTriangle size={11} /> {w}
        </div>
      ))}
      {!pv.ok && pv.reject && (
        <div className="pt-reject" data-testid="exec-reject">
          <Ban size={11} /> {pv.reject}
        </div>
      )}
    </div>
  );
}

/** Mini depth bars: each visible level on the side being taken, with the part this order consumes. */
function DepthUse({ pv }: { pv: ExecPreview }) {
  const legs = pv.take.legs.filter((l) => !l.estimated);
  if (!legs.length) return null;
  const n = Math.min(10, Math.max(legs.length + 2, 5));
  const book = useMarketStore.getState().book;
  const side = pv.touch >= pv.mid ? book?.asks : book?.bids;
  const levels = (side ?? []).slice(0, n);
  if (!levels.length) return null;
  const max = Math.max(...levels.map((l) => l.size));
  return (
    <div className="depth-use" aria-label="Book levels this order would consume" title="Book levels on the side you'd take; filled part = what this order consumes">
      {levels.map((l) => {
        const used = legs.find((g) => Math.abs(g.price - l.price) <= Math.abs(l.price) * 1e-9)?.qty ?? 0;
        return (
          <span key={l.price} className="du-col">
            <span className="du-bar" style={{ height: `${(l.size / max) * 100}%` }}>
              <span className="du-used" style={{ height: `${(Math.min(used, l.size) / l.size) * 100}%` }} />
            </span>
          </span>
        );
      })}
      {pv.take.beyondBook && <span className="du-more">+ beyond book</span>}
    </div>
  );
}
