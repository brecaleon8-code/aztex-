import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Pause, Play } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { toast } from '@/stores/useToastStore';
import { exchangeNetflow, FLOW_LABEL, type ClassifiedTransfer, type FlowKind } from '@/lib/onchain/flows';
import { NETWORKS } from '@/lib/onchain/networks';
import { short } from '@/lib/onchain/query';
import type { NetworkId } from '@/lib/onchain/types';
import { fmtTime } from '@/lib/format';
import { Addr, NetBadge, ago, fmtAmount, fmtUsdShort, searchHref, useLabels } from './common';

const MIN_USD = [250_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000];
const KINDS: { id: 'all' | FlowKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'exchange_inflow', label: 'Exchange in' },
  { id: 'exchange_outflow', label: 'Exchange out' },
  { id: 'mint', label: 'Mints' },
  { id: 'bridge', label: 'Bridges' },
  { id: 'wallet_transfer', label: 'Wallet ↔ wallet' },
];
const ASSETS = ['*', 'BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'LINK', 'PEPE'];

/** Whale & exchange-flow monitor: observed transfers, with any interpretation shown separately. */
export function FlowMonitor() {
  const all = useOnchainStore((s) => s.transfers);
  const labels = useLabels();
  const [minUsd, setMinUsd] = useState(1_000_000);
  const [net, setNet] = useState<NetworkId | '*'>('*');
  const [kind, setKind] = useState<'all' | FlowKind>('all');
  const [asset, setAsset] = useState('*');
  const [frozen, setFrozen] = useState<ClassifiedTransfer[] | null>(null);
  const src = frozen ?? all;
  const matchAsset = (t: ClassifiedTransfer) => asset === '*' || t.token.symbol === asset || t.token.priceSymbol === asset;
  const rows = src.filter((t) => t.usd >= minUsd && (net === '*' || t.network === net) && (kind === 'all' || t.kind === kind) && matchAsset(t)).slice(0, 80);

  // Last-hour summary over everything (filters on asset/network only).
  const hour = useMemo(() => {
    const since = Date.now() - 3_600_000;
    let inflow = 0;
    let outflow = 0;
    let minted = 0;
    let whales = 0;
    for (const t of all) {
      if (t.time < since || (net !== '*' && t.network !== net) || !matchAsset(t)) continue;
      if (t.kind === 'exchange_inflow') inflow += t.usd;
      if (t.kind === 'exchange_outflow') outflow += t.usd;
      if (t.kind === 'mint') minted += t.usd;
      if (t.usd >= 10_000_000) whales++;
    }
    return { inflow, outflow, net: inflow - outflow, minted, whales };
  }, [all, net, asset]);

  const watch = (address: string, network: NetworkId) => {
    useOnchainStore.getState().addRule({ kind: 'wallet', network, address, direction: 'any', minUsd: 100_000 });
    toast({ kind: 'success', title: 'Watching wallet', detail: `${short(address)} on ${NETWORKS.find((n) => n.id === network)?.name}` });
  };

  return (
    <Panel
      title="Whale & exchange flows"
      sub={`${rows.length} shown`}
      flush
      testId="oc-flows"
      actions={
        <button className={`btn sm ${frozen ? 'active' : ''}`} onClick={() => setFrozen(frozen ? null : all)} aria-pressed={!!frozen} data-testid="oc-pause">
          {frozen ? <Play size={12} /> : <Pause size={12} />} {frozen ? 'Resume' : 'Pause'}
        </button>
      }
    >
      <div className="oc-flow-summary" data-testid="oc-flow-summary">
        <div>
          <span className="label">Exchange inflow · 1h</span>
          <span className="num">{fmtUsdShort(hour.inflow)}</span>
        </div>
        <div>
          <span className="label">Exchange outflow · 1h</span>
          <span className="num">{fmtUsdShort(hour.outflow)}</span>
        </div>
        <div title="Inflow − outflow. Positive = more coins moved onto exchanges.">
          <span className="label">Net to exchanges</span>
          <span className={`num ${hour.net > 0 ? 'down' : 'up'}`}>{fmtUsdShort(hour.net)}</span>
        </div>
        <div>
          <span className="label">Stablecoins minted</span>
          <span className="num">{fmtUsdShort(hour.minted)}</span>
        </div>
        <div>
          <span className="label">Moves ≥ $10M</span>
          <span className="num">{hour.whales}</span>
        </div>
      </div>
      <div className="oc-filters">
        <select className="input oc-select" value={minUsd} onChange={(e) => setMinUsd(+e.target.value)} aria-label="Minimum size">
          {MIN_USD.map((v) => (
            <option key={v} value={v}>
              ≥ {fmtUsdShort(v)}
            </option>
          ))}
        </select>
        <select className="input oc-select" value={net} onChange={(e) => setNet(e.target.value as NetworkId | '*')} aria-label="Network">
          <option value="*">All networks</option>
          {NETWORKS.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <select className="input oc-select" value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Asset">
          {ASSETS.map((a) => (
            <option key={a} value={a}>
              {a === '*' ? 'All assets' : a}
            </option>
          ))}
        </select>
        <div className="oc-chips" role="group" aria-label="Flow type">
          {KINDS.map((k) => (
            <button key={k.id} className={`oc-chip ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="oc-flow-list" data-testid="oc-flow-list">
        {rows.map((t) => (
          <div key={t.id} className={`oc-flow k-${t.kind}`} data-testid="oc-flow-row">
            <div className="oc-flow-main">
              <span className="mono faint oc-flow-time" title={fmtTime(t.time)}>
                {ago(t.time)}
              </span>
              <NetBadge id={t.network} compact />
              <span className="oc-flow-amt">
                <span className="mono">{fmtAmount(t.amount)}</span> <span className="oc-sym">{t.token.symbol}</span>
                <span className="num oc-flow-usd">{fmtUsdShort(t.usd)}</span>
              </span>
              <span className="oc-flow-path">
                <Addr a={t.from} network={t.network} labels={labels} head={5} />
                <span className="faint">→</span>
                <Addr a={t.to} network={t.network} labels={labels} head={5} />
              </span>
              <span className={`oc-kind-chip k-${t.kind}`} title="Observed on-chain">
                {FLOW_LABEL[t.kind]}
              </span>
              <span className="spacer" />
              <Link to={searchHref(t.hash, t.network)} className="mono faint oc-flow-hash" title="Open transaction">
                {short(t.hash, 6, 4)}
              </Link>
              <button className="oc-icon" title="Alert when the sender moves funds again" aria-label="Watch sender" onClick={() => watch(t.from, t.network)}>
                <Bell size={11} />
              </button>
            </div>
            {t.inferred && (
              <div className="oc-inferred">
                <span className="oc-inferred-tag">Inferred</span> {t.inferred}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="oc-empty">No transfers match these filters yet.</div>}
      </div>
    </Panel>
  );
}

/** Exchange netflow per 5-minute bucket (last hour): inflow up, outflow down — two hues, one axis. */
export function NetflowChart() {
  const all = useOnchainStore((s) => s.transfers);
  const { bull, bear } = useThemeStore((s) => s.colors);
  const [asset, setAsset] = useState('*');
  const [hover, setHover] = useState<number | null>(null);
  const BUCKET = 300_000;
  const N = 12;
  const buckets = useMemo(() => exchangeNetflow(all, Date.now(), BUCKET, N, asset === '*' ? undefined : asset), [all, asset]);
  const W = 420;
  const H = 150;
  const PAD_T = 12;
  const PAD_B = 18;
  const mid = PAD_T + (H - PAD_T - PAD_B) / 2;
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.inflow, b.outflow)));
  const half = (H - PAD_T - PAD_B) / 2 - 2;
  const slot = W / N;
  const bw = Math.max(4, slot - 6);
  const totIn = buckets.reduce((s, b) => s + b.inflow, 0);
  const totOut = buckets.reduce((s, b) => s + b.outflow, 0);
  const hb = hover != null ? buckets[hover] : null;
  return (
    <Panel
      title="Exchange netflow"
      sub="last hour · 5-min buckets"
      testId="oc-netflow"
      actions={
        <select className="input oc-select" value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Netflow asset">
          {ASSETS.map((a) => (
            <option key={a} value={a}>
              {a === '*' ? 'All assets' : a}
            </option>
          ))}
        </select>
      }
    >
      <div className="oc-legend">
        <span>
          <i style={{ background: bear }} /> Inflow to exchanges <b className="num">{fmtUsdShort(totIn)}</b>
        </span>
        <span>
          <i style={{ background: bull }} /> Outflow from exchanges <b className="num">{fmtUsdShort(totOut)}</b>
        </span>
        <span className="faint">
          Net <b className="num">{fmtUsdShort(totIn - totOut)}</b>
        </span>
      </div>
      <div className="oc-chart-wrap" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Exchange inflow and outflow per 5 minutes">
          <line x1={0} x2={W} y1={mid} y2={mid} className="oc-axis" />
          {buckets.map((b, i) => {
            const x = i * slot + (slot - bw) / 2;
            const hi = (b.inflow / max) * half;
            const ho = (b.outflow / max) * half;
            return (
              <g key={b.start} onMouseEnter={() => setHover(i)} className={hover === i ? 'oc-bar-hover' : undefined}>
                <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
                {hi > 0 && <path d={roundTop(x, mid - 1, bw, hi)} fill={bear} />}
                {ho > 0 && <path d={roundBottom(x, mid + 1, bw, ho)} fill={bull} />}
              </g>
            );
          })}
          <text x={2} y={H - 4} className="oc-axis-text">
            {fmtTime(buckets[0].start, false)}
          </text>
          <text x={W - 2} y={H - 4} className="oc-axis-text" textAnchor="end">
            now
          </text>
          <text x={W - 2} y={PAD_T - 2} className="oc-axis-text" textAnchor="end">
            {fmtUsdShort(max)}
          </text>
        </svg>
        {hb && (
          <div className="oc-tip" style={{ left: `${((hover! + 0.5) / N) * 100}%` }} data-testid="oc-netflow-tip">
            <b>{fmtTime(hb.start, false)}</b>
            <span>In {fmtUsdShort(hb.inflow)}</span>
            <span>Out {fmtUsdShort(hb.outflow)}</span>
            <span>Net {fmtUsdShort(hb.net)}</span>
          </div>
        )}
      </div>
      <p className="faint oc-fineprint">Observed transfers to and from labelled exchange wallets. Exchange balances also move for internal reasons, so netflow is a signal, not a trade count.</p>
    </Panel>
  );
}

/** Bar rising from a baseline with a 4px rounded data-end. */
function roundTop(x: number, base: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + w - r}Q${x + w},${base - h} ${x + w},${base - h + r}V${base}Z`;
}
function roundBottom(x: number, base: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${base + h - r}Q${x},${base + h} ${x + r},${base + h}H${x + w - r}Q${x + w},${base + h} ${x + w},${base + h - r}V${base}Z`;
}
