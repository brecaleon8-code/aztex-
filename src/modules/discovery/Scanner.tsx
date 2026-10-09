import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, Fish, ExternalLink, Flag, BellPlus, X, Bell, Pin } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { NumericField } from '@/components/ui/NumericField';
import { useDiscoveryStore } from '@/stores/useDiscoveryStore';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtCompact, fmtQty, fmtTime, truncAddr } from '@/lib/format';
import type { ScannerEventType } from '@/types';

const TYPE_META: Record<ScannerEventType, { label: string; icon: typeof Fish }> = {
  large_transfer: { label: 'Large transfer', icon: ArrowRightLeft },
  exchange_inflow: { label: 'Exchange inflow', icon: ArrowDownToLine },
  exchange_outflow: { label: 'Exchange outflow', icon: ArrowUpFromLine },
  whale_move: { label: 'Whale move', icon: Fish },
};

const explorer = (tx: string) => `https://blockscan.com/tx/${tx}`;

function Addr({ a }: { a: string }) {
  return a.startsWith('0x') ? <span className="mono">{truncAddr(a)}</span> : <span className="dim">{a}</span>;
}

export function Scanner() {
  const events = useDiscoveryStore((s) => s.events);
  const tracked = useDiscoveryStore((s) => s.tracked);
  const toggleTrack = useDiscoveryStore((s) => s.toggleTrack);
  const trackedIds = new Set(tracked.map((t) => t.sourceEventId));

  return (
    <div className="disc-scanner">
      <Panel
        title="Blockchain scanner"
        sub="large transfers · exchange flows · whales"
        flush
        testId="scanner"
        actions={
          <span className="row" style={{ gap: 10 }}>
            <span className="row" style={{ gap: 6 }}>
              <span className="live-dot" />
              <span className="label">Live</span>
            </span>
            <Link to="/onchain" className="btn sm" data-testid="open-onchain">
              Full on-chain scanner →
            </Link>
          </span>
        }
      >
        <div className="scanner-table">
          <table className="table">
            <thead>
              <tr>
                <th>Asset · network</th>
                <th>Event</th>
                <th className="r">Amount</th>
                <th className="r">USD</th>
                <th>From → To</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const M = TYPE_META[e.type];
                const on = trackedIds.has(e.id);
                return (
                  <tr key={e.id} className={`scan-row ${e.flagged ? 'flagged' : ''}`} data-testid="scanner-row">
                    <td>
                      <span className="mono" style={{ fontWeight: 600 }}>{e.symbol}</span> <span className="label">{e.network}</span>
                    </td>
                    <td>
                      <span className={`ev-type ev-${e.type}`}>
                        <M.icon size={12} /> {M.label}
                      </span>
                    </td>
                    <td className="r num">{fmtQty(e.amount)}</td>
                    <td className="r num">
                      {e.flagged && <Flag size={11} className="flag-icon" aria-label="Flagged: above threshold" />} ${fmtCompact(e.usd)}
                    </td>
                    <td>
                      <span className="row" style={{ gap: 5 }}>
                        <Addr a={e.from} /> <span className="faint">→</span> <Addr a={e.to} />
                        <a href={explorer(e.txHash)} target="_blank" rel="noreferrer" className="ext" aria-label="Open in block explorer">
                          <ExternalLink size={11} />
                        </a>
                      </span>
                    </td>
                    <td className="num faint">{fmtTime(e.time)}</td>
                    <td className="r">
                      <button className={`btn sm ${on ? 'active' : 'ghost'}`} onClick={() => toggleTrack(e)} aria-pressed={on} title="Track this pattern">
                        <Pin size={11} /> {on ? 'Tracking' : 'Track'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="scanner-side">
        <AlertBuilder />
        <AlertsFeed />
      </div>
    </div>
  );
}

function AlertBuilder() {
  const rules = useDiscoveryStore((s) => s.rules);
  const { addRule, removeRule } = useDiscoveryStore.getState();
  const [symbol, setSymbol] = useState('BTC');
  const [threshold, setThreshold] = useState(10_000_000);
  return (
    <Panel title="Alert builder" sub="notify on transfer size" testId="alert-builder">
      <div className="col" style={{ gap: 8 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 92 }}>
            <span className="label">Asset</span>
            <select className="input mono" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Alert asset">
              {ASSET_UNIVERSE.map((a) => (
                <option key={a.symbol}>{a.symbol}</option>
              ))}
            </select>
          </label>
          <div className="grow">
            <NumericField label="USD threshold" value={threshold} onCommit={setThreshold} suffix="USD" ariaLabel="USD threshold" testId="alert-threshold" />
          </div>
        </div>
        <button className="btn primary" onClick={() => addRule(symbol, threshold)} disabled={!(threshold > 0)} data-testid="add-alert">
          <BellPlus size={13} /> Add alert
        </button>
        {rules.length > 0 && <div className="divider" />}
        {rules.map((r) => (
          <div key={r.id} className="row rule-row" data-testid="alert-rule">
            <Bell size={12} className="faint" />
            <span className="mono" style={{ fontWeight: 600 }}>{r.symbol}</span>
            <span className="label">≥</span>
            <span className="num">${fmtCompact(r.thresholdUsd)}</span>
            <span className="spacer" />
            <button className="btn ghost sm icon" onClick={() => removeRule(r.id)} aria-label="Remove alert">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AlertsFeed() {
  const alerts = useDiscoveryStore((s) => s.alerts);
  const clear = useDiscoveryStore((s) => s.clearAlerts);
  return (
    <Panel title="Alerts" sub={`${alerts.length}`} flush actions={alerts.length > 0 && <button className="btn ghost sm" onClick={clear}>Clear</button>}>
      <div className="alerts-feed">
        {alerts.length === 0 && <div className="empty">Track a row or add a threshold alert.</div>}
        {alerts.map((a) => (
          <div key={a.id} className="alert-item">
            <div className="row">
              <span className="dim" style={{ fontSize: 11.5 }}>{a.reason}</span>
              <span className="spacer" />
              <span className="num faint" style={{ fontSize: 10.5 }}>{fmtTime(a.time)}</span>
            </div>
            <div className="row num" style={{ fontSize: 11 }}>
              <span>{a.event.symbol}</span>
              <span className="faint">{TYPE_META[a.event.type].label}</span>
              <span className="spacer" />
              <span>${fmtCompact(a.event.usd)}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
