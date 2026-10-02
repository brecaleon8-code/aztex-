import { useEffect, useState } from 'react';
import { Timer, Send, CheckCircle2 } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { NumericField } from '@/components/ui/NumericField';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { OTC_DESKS, QUOTE_TTL_MS, generateQuote } from '@/lib/mock/otc';
import { useMarketStore } from '@/stores/useMarketStore';
import { useOtcStore } from '@/stores/useOtcStore';
import { toast } from '@/stores/useToastStore';
import { fmtPrice, fmtQty, fmtTime, fmtUsd } from '@/lib/format';
import './otc.css';

export function OtcPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>OTC Desk</h1>
          <p>Request firm block quotes from participating desks. Quotes are live for {QUOTE_TTL_MS / 1000} seconds.</p>
        </div>
      </div>
      <div className="otc-grid">
        <Rfq />
        <Desks />
        <Blotter />
      </div>
    </div>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Rfq() {
  const [symbol, setSymbol] = useState('BTC');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState(25);
  const [requesting, setRequesting] = useState(false);
  const quote = useOtcStore((s) => s.quote);
  const { setQuote, accept } = useOtcStore.getState();
  const mid = useMarketStore((s) => s.assets[symbol].price);
  const now = useNow(!!quote);
  const remaining = quote ? Math.max(0, quote.expiresAt - now) : 0;
  const expired = !!quote && remaining <= 0;

  const request = () => {
    setRequesting(true);
    setQuote(null);
    setTimeout(() => {
      setQuote(generateQuote(symbol, side, amount, useMarketStore.getState().assets[symbol].price));
      setRequesting(false);
    }, 650);
  };

  return (
    <Panel title="Request for quote" testId="rfq">
      <div className="col" style={{ gap: 12 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 110 }}>
            <span className="label">Asset</span>
            <select className="input mono" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="OTC asset">
              {ASSET_UNIVERSE.map((a) => (
                <option key={a.symbol}>{a.symbol}</option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="label">Side</span>
            <Segmented
              value={side}
              onChange={setSide}
              ariaLabel="OTC side"
              thumbClassName={side === 'buy' ? 'long' : 'short'}
              className="side-seg"
              options={[
                { value: 'buy', label: 'Buy' },
                { value: 'sell', label: 'Sell' },
              ]}
            />
          </div>
          <div className="grow">
            <NumericField label="Amount" value={amount} onCommit={setAmount} suffix={symbol} ariaLabel="OTC amount" testId="otc-amount" />
          </div>
        </div>
        <div className="row">
          <span className="label">Indicative mid</span>
          <span className="num">{fmtPrice(mid)}</span>
          <span className="spacer" />
          <span className="label">Notional ≈</span>
          <span className="num">${fmtUsd(mid * amount, 0)}</span>
        </div>
        <button className="btn primary lg" onClick={request} disabled={requesting || !(amount > 0)} data-testid="request-quote">
          <Send size={14} /> {requesting ? 'Requesting…' : quote ? 'Request new quote' : 'Request quote'}
        </button>

        {quote && (
          <div className={`quote ${expired ? 'expired' : ''}`} data-testid="quote">
            <div className="row">
              <span className="label">Quote from</span>
              <span style={{ fontWeight: 600 }}>{quote.desk}</span>
              <span className="spacer" />
              <span className={`countdown mono ${remaining < 5000 ? 'warn' : ''}`} data-testid="quote-countdown">
                <Timer size={12} /> {expired ? 'Expired' : `${(remaining / 1000).toFixed(1)}s`}
              </span>
            </div>
            <div className="countdown-bar">
              <span style={{ width: `${(remaining / QUOTE_TTL_MS) * 100}%` }} />
            </div>
            <div className="quote-grid">
              <span className="label">{quote.side === 'buy' ? 'You buy' : 'You sell'}</span>
              <span className="num">{fmtQty(quote.amount)} {quote.symbol}</span>
              <span className="label">All-in price</span>
              <span className="num">{fmtPrice(quote.price)}</span>
              <span className="label">Total</span>
              <span className="num quote-total">{fmtUsd(quote.total)} USDT</span>
            </div>
            <button
              className="btn primary lg"
              disabled={expired}
              data-testid="accept-quote"
              onClick={() => {
                const f = accept();
                if (f) toast({ kind: 'success', title: `OTC ${f.side} executed`, detail: `${fmtQty(f.amount)} ${f.symbol} @ ${fmtPrice(f.price)} · ${f.desk}` });
                else toast({ kind: 'error', title: 'Quote expired' });
              }}
            >
              <CheckCircle2 size={15} /> Accept &amp; execute
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Desks() {
  return (
    <Panel title="Participating desks" flush>
      <table className="table">
        <thead>
          <tr>
            <th>Desk</th>
            <th className="r">Indicative spread</th>
            <th className="r">Status</th>
          </tr>
        </thead>
        <tbody>
          {OTC_DESKS.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td className="r num">{d.spreadBps} bps</td>
              <td className="r">
                <span className="badge accent">Streaming</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Blotter() {
  const blotter = useOtcStore((s) => s.blotter);
  return (
    <Panel title="OTC blotter" sub={`${blotter.length} fills`} flush className="otc-blotter" testId="blotter">
      {blotter.length === 0 ? (
        <div className="empty">Accepted quotes land here.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Asset</th>
              <th>Side</th>
              <th className="r">Amount</th>
              <th className="r">Price</th>
              <th className="r">Total (USDT)</th>
              <th>Desk</th>
            </tr>
          </thead>
          <tbody>
            {blotter.map((f) => (
              <tr key={f.id} data-testid="blotter-row">
                <td className="num faint">{fmtTime(f.executedAt)}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{f.symbol}</td>
                <td>
                  <span className={`badge ${f.side === 'buy' ? 'long' : 'short'}`}>{f.side === 'buy' ? 'Buy' : 'Sell'}</span>
                </td>
                <td className="r num">{fmtQty(f.amount)}</td>
                <td className="r num">{fmtPrice(f.price)}</td>
                <td className="r num">{fmtUsd(f.total)}</td>
                <td className="dim">{f.desk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
