import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, Radio, FlaskConical } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useOnchainStore, type DataMode } from '@/stores/useOnchainStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { parseQuery } from '@/lib/onchain/query';
import { NETWORKS } from '@/lib/onchain/networks';
import { SimOnchainProvider, simEntities, simTip, simHash } from '@/lib/onchain/sim';
import { LiveOnchainProvider } from '@/lib/onchain/live';
import { TOKENS } from '@/lib/onchain/tokens';
import { mulberry32, hashSeed } from '@/lib/mock/rng';
import type { NetworkId, OnchainProvider } from '@/lib/onchain/types';
import { Results } from './Results';
import { FlowMonitor, NetflowChart } from './FlowMonitor';
import { FeeMonitor } from './Fees';
import { OnchainAlerts } from './Alerts';
import { NetBadge } from './common';
import './onchain.css';

const prices = () => Object.fromEntries(Object.values(useMarketStore.getState().assets).map((a) => [a.symbol, a.price]));
const SIM = new SimOnchainProvider(prices);
const LIVE = new LiveOnchainProvider();

/** Example queries that resolve in each mode (live ones are real, well-known chain objects). */
function examples(mode: DataMode): { label: string; q: string; net?: NetworkId }[] {
  if (mode === 'live')
    return [
      { label: 'Bitcoin halving block', q: '840000', net: 'bitcoin' },
      { label: 'Binance 14 wallet', q: '0x28C6c06298d514Db089934071355E5743bf21d60' },
      { label: 'USDC on Solana', q: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
      { label: 'USDT token', q: 'USDT', net: 'ethereum' },
    ];
  const r = mulberry32(hashSeed('examples'));
  return [
    { label: 'Ethereum transaction', q: simHash('ethereum', r) },
    { label: 'Exchange wallet', q: simEntities('ethereum')[0].address },
    { label: 'Bitcoin block', q: String(simTip('bitcoin') - 3), net: 'bitcoin' },
    { label: 'USDT token', q: 'USDT' },
    { label: 'Solana account', q: TOKENS.find((t) => t.network === 'solana')!.address },
  ];
}

export function OnchainPage() {
  const mode = useOnchainStore((s) => s.mode);
  const setMode = useOnchainStore((s) => s.setMode);
  const history = useOnchainStore((s) => s.history);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const net = (params.get('net') as NetworkId | null) || null;
  const [draft, setDraft] = useState(q);
  useEffect(() => {
    setDraft(q);
  }, [q]);
  const live = parseQuery(draft, net);
  const submitted = useMemo(() => (q ? parseQuery(q, net) : null), [q, net]);
  const provider: OnchainProvider = mode === 'live' ? LIVE : SIM;

  const go = (value: string, n: NetworkId | null = net) => {
    const v = value.trim();
    if (!v) return;
    useOnchainStore.getState().pushHistory(v, n);
    setParams(n ? { q: v, net: n } : { q: v });
  };

  return (
    <div className="onchain">
      <div className="page-head">
        <div>
          <h1>On-chain</h1>
          <p>Search transactions, wallets, blocks, tokens and contracts across {NETWORKS.length} networks; follow whale and exchange flows; get alerted when they move.</p>
        </div>
        <div className="oc-mode">
          <Segmented<DataMode>
            ariaLabel="Data source"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'sim', label: 'Simulated', title: 'Deterministic simulated chain data — works offline' },
              { value: 'live', label: 'Live RPC · beta', title: 'Real lookups through public RPC endpoints (no API keys)' },
            ]}
          />
          <span className={`oc-mode-badge ${mode}`} data-testid="oc-mode-badge">
            {mode === 'live' ? <Radio size={12} /> : <FlaskConical size={12} />}
            {mode === 'live' ? 'Search uses live public RPC · flows below are simulated' : 'Simulated data — not real chain activity'}
          </span>
        </div>
      </div>

      <section className="panel oc-search-panel" data-testid="oc-search">
        <form
          className="oc-search"
          onSubmit={(e) => {
            e.preventDefault();
            go(draft);
          }}
        >
          <Search size={16} className="faint" />
          <input
            className="oc-search-input mono"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Transaction hash, address, block number, token symbol or contract…"
            aria-label="Search the chain"
            spellCheck={false}
            data-testid="oc-search-input"
          />
          {draft && (
            <button type="button" className="oc-icon" aria-label="Clear" onClick={() => setParams({})}>
              <X size={13} />
            </button>
          )}
          <select className="input oc-select" value={net ?? ''} onChange={(e) => setParams(q ? (e.target.value ? { q, net: e.target.value } : { q }) : e.target.value ? { net: e.target.value } : {})} aria-label="Network filter" data-testid="oc-net-filter">
            <option value="">All networks</option>
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <button className="btn primary" type="submit" disabled={!draft.trim()} data-testid="oc-search-go">
            Search
          </button>
        </form>
        <div className="oc-search-meta">
          {draft.trim() ? (
            <span className={`oc-hint ${live ? '' : 'bad'}`} data-testid="oc-query-hint">
              {live ? (
                <>
                  {live.hint}
                  {live.networks.length > 0 && (
                    <span className="oc-hint-nets">
                      {live.networks.slice(0, 5).map((n) => (
                        <NetBadge key={n} id={n} compact />
                      ))}
                      {live.networks.length > 5 && <span className="faint">+{live.networks.length - 5}</span>}
                    </span>
                  )}
                </>
              ) : (
                'Unrecognised format'
              )}
            </span>
          ) : (
            <span className="oc-examples">
              <span className="faint">Try</span>
              {examples(mode).map((x) => (
                <button key={x.label} type="button" className="oc-chip" onClick={() => go(x.q, x.net ?? null)} data-testid="oc-example">
                  {x.label}
                </button>
              ))}
            </span>
          )}
          {history.length > 0 && !draft.trim() && (
            <span className="oc-recent">
              <span className="faint">Recent</span>
              {history.slice(0, 4).map((h) => (
                <button key={h.q} type="button" className="oc-chip mono" onClick={() => go(h.q, h.network)} title={h.q}>
                  {h.q.length > 14 ? `${h.q.slice(0, 8)}…${h.q.slice(-4)}` : h.q}
                </button>
              ))}
            </span>
          )}
        </div>
        <div className="oc-net-strip" aria-label="Supported networks">
          {NETWORKS.map((n) => (
            <span key={n.id} className="oc-net-cap" title={`${n.name}: ${[n.caps.tokens && 'tokens', n.caps.contracts && 'contracts', n.caps.holders && 'holder data'].filter(Boolean).join(', ') || 'native transfers only'}${mode === 'live' ? (n.rpc ? ' · live via public RPC' : ' · not available live') : ''}`}>
              <NetBadge id={n.id} compact />
              {mode === 'live' && !n.rpc && <span className="faint">sim only</span>}
            </span>
          ))}
        </div>
      </section>

      {submitted && (
        <div className="oc-results" data-testid="oc-results">
          <Results key={`${q}|${net}|${mode}`} q={submitted} provider={provider} />
        </div>
      )}

      <div className="oc-grid-main">
        <div className="oc-col-wide">
          <FlowMonitor />
        </div>
        <div className="oc-col-side">
          <OnchainAlerts />
          <NetflowChart />
          <FeeMonitor />
        </div>
      </div>
    </div>
  );
}
