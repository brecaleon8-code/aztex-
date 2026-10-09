import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Wallet, ArrowLeftRight, Gauge, Activity } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { toast } from '@/stores/useToastStore';
import type { AlertKind, AlertRule } from '@/lib/onchain/alerts';
import { NETWORK, NETWORKS } from '@/lib/onchain/networks';
import { TOKENS } from '@/lib/onchain/tokens';
import { parseQuery, short } from '@/lib/onchain/query';
import type { NetworkId } from '@/lib/onchain/types';
import { fmtTime } from '@/lib/format';
import { NetBadge, ago, fmtUsdShort, searchHref } from './common';

const KIND_META: Record<AlertKind, { label: string; icon: typeof Wallet }> = {
  wallet: { label: 'Wallet', icon: Wallet },
  large_transfer: { label: 'Large transfer', icon: ArrowLeftRight },
  fee_spike: { label: 'Fee spike', icon: Gauge },
  token_activity: { label: 'Token activity', icon: Activity },
};
const SIZES = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000];

export function describeRule(r: AlertRule): string {
  switch (r.kind) {
    case 'wallet':
      return `${r.name || short(r.address)} ${r.direction === 'any' ? 'moves' : r.direction === 'out' ? 'sends' : 'receives'} ≥ ${fmtUsdShort(r.minUsd)}${r.network === '*' ? '' : ` on ${NETWORK[r.network].name}`}`;
    case 'large_transfer':
      return `${r.symbol === '*' ? 'Any asset' : r.symbol} transfer ≥ ${fmtUsdShort(r.minUsd)}${r.exchangeOnly ? ' to/from exchanges' : ''}${r.network === '*' ? '' : ` on ${NETWORK[r.network].name}`}`;
    case 'fee_spike':
      return `${NETWORK[r.network].name} fees ${r.mode === 'pct' ? `+${r.value}% over median` : `above ${r.value} ${NETWORK[r.network].feeUnit}`}`;
    case 'token_activity':
      return `${r.symbol} on ${NETWORK[r.network].name}: ${r.metric === 'count' ? 'transfers/min' : 'volume/min'} ≥ ${r.z}σ above normal`;
  }
}

/** Rule builder + active rules + alert log for on-chain events. */
export function OnchainAlerts() {
  const rules = useOnchainStore((s) => s.rules);
  const hits = useOnchainStore((s) => s.hits);
  const { updateRule, removeRule, clearHits, markSeen } = useOnchainStore.getState();
  useEffect(() => {
    markSeen();
  }, [hits.length, markSeen]);
  return (
    <Panel title="On-chain alerts" sub={`${rules.filter((r) => r.enabled).length} active`} testId="oc-alerts">
      <RuleBuilder />
      <div className="oc-sub">Rules</div>
      <div className="oc-rules" data-testid="oc-rules">
        {rules.map((r) => {
          const M = KIND_META[r.kind];
          return (
            <div key={r.id} className={`oc-rule ${r.enabled ? '' : 'off'}`} data-testid="oc-rule">
              <M.icon size={13} className="faint" />
              <span className="oc-rule-text">{describeRule(r)}</span>
              <span className="mono faint oc-rule-hits" title={r.lastHit ? `Last ${fmtTime(r.lastHit)}` : 'Not triggered yet'}>
                {r.hits}×
              </span>
              <label className="oc-switch" title={r.enabled ? 'Pause' : 'Enable'}>
                <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.id, { enabled: e.target.checked })} aria-label={`Enable ${describeRule(r)}`} />
                <span />
              </label>
              <button className="oc-icon" aria-label="Delete rule" onClick={() => removeRule(r.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
        {rules.length === 0 && <div className="oc-empty sm">No rules yet. Add one above, or use the bell icons on wallets, transfers and fees.</div>}
      </div>
      <div className="row oc-sub">
        <span>Alert log</span>
        <span className="spacer" />
        {hits.length > 0 && (
          <button className="btn sm ghost" onClick={clearHits}>
            Clear
          </button>
        )}
      </div>
      <div className="oc-hits" data-testid="oc-hits">
        {hits.map((h) => (
          <div key={h.id} className="oc-hit" data-testid="oc-hit">
            <span className="mono faint">{ago(h.time)}</span>
            <NetBadge id={h.network} compact />
            <span className="oc-hit-body">
              <b>{h.title}</b>
              <span className="faint">{h.detail}</span>
            </span>
            {h.hash && (
              <Link className="mono faint" to={searchHref(h.hash, h.network)}>
                tx
              </Link>
            )}
          </div>
        ))}
        {hits.length === 0 && <div className="oc-empty sm">Nothing yet — triggered alerts appear here and as notifications on any page.</div>}
      </div>
    </Panel>
  );
}

function RuleBuilder() {
  const [kind, setKind] = useState<AlertKind>('large_transfer');
  const [network, setNetwork] = useState<NetworkId | '*'>('*');
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<'any' | 'in' | 'out'>('any');
  const [minUsd, setMinUsd] = useState(5_000_000);
  const [symbol, setSymbol] = useState('*');
  const [exchangeOnly, setExchangeOnly] = useState(false);
  const [feeMode, setFeeMode] = useState<'pct' | 'above'>('pct');
  const [feeValue, setFeeValue] = useState(100);
  const [token, setToken] = useState(0);
  const [metric, setMetric] = useState<'count' | 'volume'>('count');
  const [z, setZ] = useState(4);
  const addRule = useOnchainStore((s) => s.addRule);

  const parsed = address.trim() ? parseQuery(address.trim()) : null;
  const addrOk = parsed?.kind === 'address';
  const feeNet: NetworkId = network === '*' ? 'ethereum' : network;

  const submit = () => {
    let r: Parameters<typeof addRule>[0];
    if (kind === 'wallet') {
      if (!addrOk) return toast({ kind: 'error', title: 'Enter a wallet address', detail: 'EVM 0x…, Bitcoin, Solana or Tron address' });
      r = { kind, network: network === '*' ? '*' : network, address: address.trim(), name: name.trim() || undefined, direction, minUsd };
    } else if (kind === 'large_transfer') r = { kind, network, symbol, minUsd, exchangeOnly };
    else if (kind === 'fee_spike') r = { kind, network: feeNet, mode: feeMode, value: feeValue };
    else {
      const t = TOKENS[token];
      r = { kind, network: t.network, tokenAddress: t.address, symbol: t.symbol, metric, z };
    }
    const rule = addRule(r);
    toast({ kind: 'success', title: 'Alert rule added', detail: describeRule(rule) });
    setAddress('');
    setName('');
  };

  return (
    <div className="oc-builder" data-testid="oc-builder">
      <Segmented<AlertKind>
        full
        ariaLabel="Alert type"
        value={kind}
        onChange={setKind}
        options={(Object.keys(KIND_META) as AlertKind[]).map((k) => ({ value: k, label: KIND_META[k].label }))}
      />
      {kind === 'wallet' && (
        <>
          <input className="input mono" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Wallet address (0x…, bc1…, Solana, T…)" aria-label="Wallet address" data-testid="oc-rule-address" />
          {address.trim() && <span className={`oc-hint ${addrOk ? '' : 'bad'}`}>{addrOk ? parsed!.hint : 'Not a recognised address'}</span>}
          <div className="oc-builder-row">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Wallet name" />
            <select className="input oc-select" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} aria-label="Direction">
              <option value="any">Sends or receives</option>
              <option value="out">Sends</option>
              <option value="in">Receives</option>
            </select>
          </div>
        </>
      )}
      {kind === 'large_transfer' && (
        <div className="oc-builder-row">
          <select className="input oc-select" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Asset">
            <option value="*">Any asset</option>
            {['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'LINK', 'PEPE'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="oc-check">
            <input type="checkbox" checked={exchangeOnly} onChange={(e) => setExchangeOnly(e.target.checked)} /> Exchange flows only
          </label>
        </div>
      )}
      {(kind === 'wallet' || kind === 'large_transfer') && (
        <div className="oc-builder-row">
          <select className="input oc-select" value={network} onChange={(e) => setNetwork(e.target.value as NetworkId | '*')} aria-label="Network">
            <option value="*">Any network</option>
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <select className="input oc-select" value={minUsd} onChange={(e) => setMinUsd(+e.target.value)} aria-label="Minimum USD" data-testid="oc-rule-min">
            {SIZES.map((v) => (
              <option key={v} value={v}>
                ≥ {fmtUsdShort(v)}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind === 'fee_spike' && (
        <div className="oc-builder-row">
          <select className="input oc-select" value={feeNet} onChange={(e) => setNetwork(e.target.value as NetworkId)} aria-label="Network">
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <select className="input oc-select" value={feeMode} onChange={(e) => setFeeMode(e.target.value as 'pct' | 'above')} aria-label="Fee rule">
            <option value="pct">% above median</option>
            <option value="above">Above level</option>
          </select>
          <input className="input mono oc-num" type="number" min={0} value={feeValue} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setFeeValue(e.target.valueAsNumber)} aria-label="Fee threshold" />
          <span className="faint">{feeMode === 'pct' ? '%' : NETWORK[feeNet].feeUnit}</span>
        </div>
      )}
      {kind === 'token_activity' && (
        <div className="oc-builder-row">
          <select className="input oc-select" value={token} onChange={(e) => setToken(+e.target.value)} aria-label="Token">
            {TOKENS.map((t, i) => (
              <option key={t.network + t.address} value={i}>
                {t.symbol} · {NETWORK[t.network].name}
              </option>
            ))}
          </select>
          <select className="input oc-select" value={metric} onChange={(e) => setMetric(e.target.value as 'count' | 'volume')} aria-label="Metric">
            <option value="count">Transfers / min</option>
            <option value="volume">Volume / min</option>
          </select>
          <select className="input oc-select" value={z} onChange={(e) => setZ(+e.target.value)} aria-label="Sensitivity">
            <option value={3}>3σ (sensitive)</option>
            <option value={4}>4σ</option>
            <option value={5}>5σ (rare)</option>
          </select>
        </div>
      )}
      <button className="btn primary" onClick={submit} data-testid="oc-add-rule">
        <Plus size={13} /> Add alert
      </button>
    </div>
  );
}
