import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronRight, Tag, AlertTriangle, LoaderCircle, Activity } from 'lucide-react';
import type { AddressDetail, BlockDetail, NetworkId, OnchainProvider, ParsedQuery, TokenDetail, TokenRef, TxDetail } from '@/lib/onchain/types';
import { NETWORK, EVM_NETWORKS } from '@/lib/onchain/networks';
import { nativeToken, searchTokens, usdPrice, findToken } from '@/lib/onchain/tokens';
import { concentration } from '@/lib/onchain/flows';
import { labelFor, ENTITY_LABEL } from '@/lib/onchain/labels';
import { short } from '@/lib/onchain/query';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { toast } from '@/stores/useToastStore';
import { fmtTime, fmtDate } from '@/lib/format';
import { Addr, CopyBtn, ExtLink, KV, NetBadge, SourceNote, ago, fmtAmount, fmtUsdShort, searchHref, useLabels, usePrices } from './common';

type Found<T> = { network: NetworkId; data: T };
type State<T> = { loading: true } | { loading: false; error: string | null; found: Found<T>[] };

/** Run a lookup on each candidate network (sim: the most likely one only) and keep what's found. */
function useLookup<T>(networks: NetworkId[], fn: (n: NetworkId) => Promise<T | null>, deps: unknown[]): State<T> {
  const [st, setSt] = useState<State<T>>({ loading: true });
  useEffect(() => {
    let live = true;
    setSt({ loading: true });
    Promise.allSettled(networks.map((n) => fn(n))).then((rs) => {
      if (!live) return;
      const found: Found<T>[] = [];
      const errors: string[] = [];
      rs.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) found.push({ network: networks[i], data: r.value });
        else if (r.status === 'rejected') errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      });
      setSt({ loading: false, error: found.length === 0 && errors.length ? errors[0] : null, found });
    });
    return () => {
      live = false;
    };
  }, deps);
  return st;
}

function Loading() {
  return (
    <div className="oc-loading" data-testid="oc-loading">
      <LoaderCircle size={14} className="spin" /> Looking up…
    </div>
  );
}
function NotFound({ what, error }: { what: string; error?: string | null }) {
  return (
    <div className="oc-empty" data-testid="oc-notfound">
      {error ? (
        <>
          <AlertTriangle size={14} /> {error}
        </>
      ) : (
        <>No {what} found on the networks searched.</>
      )}
    </div>
  );
}

function NetTabs({ found, active, onPick }: { found: { network: NetworkId }[]; active: NetworkId; onPick: (n: NetworkId) => void }) {
  if (found.length < 2) return null;
  return (
    <div className="oc-tabs" role="tablist" aria-label="Network">
      {found.map((f) => (
        <button key={f.network} role="tab" aria-selected={f.network === active} className={f.network === active ? 'on' : ''} onClick={() => onPick(f.network)}>
          <NetBadge id={f.network} />
        </button>
      ))}
    </div>
  );
}

export function Results({ q, provider }: { q: ParsedQuery; provider: OnchainProvider }) {
  const mode = provider.id;
  if (q.networks.length === 0) return <NotFound what="match" error={q.hint} />;
  if (q.kind === 'tx') return <TxResults q={q} provider={provider} />;
  if (q.kind === 'address') return <AddressResults q={q} provider={provider} />;
  if (q.kind === 'block') return <BlockResults q={q} provider={provider} />;
  if (q.kind === 'token') return <TokenSearch q={q} provider={provider} />;
  return (
    <SourceNote tone="warn">
      ENS names aren’t resolved yet{mode === 'live' ? '' : ' in this build'} — paste the 0x address instead.
    </SourceNote>
  );
}

/* ── Transactions ──────────────────────────────────────────────────────────────────────── */

function TxResults({ q, provider }: { q: ParsedQuery; provider: OnchainProvider }) {
  const nets = provider.id === 'sim' ? q.networks.slice(0, 1) : q.networks;
  const st = useLookup(nets, (n) => provider.getTx(n, q.value), [q.value, nets.join(), provider]);
  const [active, setActive] = useState<NetworkId | null>(null);
  if (st.loading) return <Loading />;
  if (!st.found.length) return <NotFound what="transaction" error={st.error} />;
  const cur = st.found.find((f) => f.network === active) ?? st.found[0];
  return (
    <>
      <NetTabs found={st.found} active={cur.network} onPick={setActive} />
      <TxView tx={cur.data} />
    </>
  );
}

function TxView({ tx }: { tx: TxDetail }) {
  const labels = useLabels();
  const prices = usePrices();
  const n = NETWORK[tx.network];
  const nt = nativeToken(tx.network);
  const p = usdPrice(nt, prices);
  return (
    <div className="oc-card" data-testid="oc-tx">
      <div className="oc-card-head">
        <span className={`oc-pill s-${tx.status}`}>{tx.status === 'success' ? 'Success' : tx.status === 'failed' ? 'Failed' : 'Pending'}</span>
        <span className="oc-kind">Transaction</span>
        <NetBadge id={tx.network} />
        <span className="mono oc-hash" title={tx.hash}>
          {short(tx.hash, 10, 8)}
        </span>
        <CopyBtn text={tx.hash} />
        <span className="spacer" />
        <ExtLink href={n.explorer.tx(tx.hash)} label={n.explorer.name} />
      </div>
      <div className="oc-grid">
        <KV k="Block">{tx.block != null ? <Link to={searchHref(String(tx.block), tx.network)} className="mono">{tx.block.toLocaleString('en-US')}</Link> : <span className="faint">in mempool</span>}</KV>
        <KV k="Time">{tx.time ? `${fmtDate(tx.time)} ${fmtTime(tx.time)} · ${ago(tx.time)}` : '—'}</KV>
        <KV k="Confirmations">{tx.confirmations != null ? tx.confirmations.toLocaleString('en-US') : '—'}</KV>
        <KV k="From">
          <Addr a={tx.from} network={tx.network} labels={labels} />
        </KV>
        <KV k={tx.createsContract ? 'Created contract' : 'To'}>
          <Addr a={tx.createsContract ?? tx.to} network={tx.network} labels={labels} />
        </KV>
        <KV k="Value" testId="oc-tx-value">
          <span className="mono">
            {fmtAmount(tx.value, 8)} {nt.symbol}
          </span>
          {p != null && tx.value > 0 && <span className="faint"> · {fmtUsdShort(tx.value * p)}</span>}
        </KV>
        <KV k="Fee">
          <span className="mono">{tx.fee != null ? `${fmtAmount(tx.fee, 8)} ${nt.symbol}` : '—'}</span>
          {p != null && tx.fee != null && <span className="faint"> · ${(tx.fee * p).toFixed(2)}</span>}
        </KV>
        {tx.gasUsed != null && (
          <KV k="Gas used · price">
            <span className="mono">
              {tx.gasUsed.toLocaleString('en-US')} · {tx.gasPrice != null ? `${tx.gasPrice.toFixed(2)} gwei` : '—'}
            </span>
          </KV>
        )}
        {tx.nonce != null && <KV k="Nonce">{tx.nonce}</KV>}
        {tx.method && (
          <KV k="Method">
            <span className="mono">{tx.method.name ?? 'unknown'}</span> <span className="faint mono">{tx.method.selector}</span>
          </KV>
        )}
      </div>
      {tx.transfers.length > 0 && (
        <>
          <div className="oc-sub">Token transfers</div>
          <table className="oc-table">
            <tbody>
              {tx.transfers.map((t, i) => {
                const pp = usdPrice(t.token, prices);
                return (
                  <tr key={i}>
                    <td>
                      <span className="oc-sym">{t.token.symbol}</span>
                    </td>
                    <td>
                      <Addr a={t.from} network={tx.network} labels={labels} head={5} /> <span className="faint">→</span> <Addr a={t.to} network={tx.network} labels={labels} head={5} />
                    </td>
                    <td className="r mono">{fmtAmount(t.amount)}</td>
                    <td className="r faint">{pp != null ? fmtUsdShort(t.amount * pp) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {(tx.ins || tx.outs) && (
        <div className="oc-io">
          <div>
            <div className="oc-sub">Inputs</div>
            {tx.ins?.map((x, i) => (
              <div key={i} className="oc-io-row">
                <Addr a={x.address} network={tx.network} labels={labels} head={8} />
                <span className="mono">{fmtAmount(x.value, 8)}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="oc-sub">Outputs</div>
            {tx.outs?.map((x, i) => (
              <div key={i} className="oc-io-row">
                <Addr a={x.address} network={tx.network} labels={labels} head={8} />
                <span className="mono">{fmtAmount(x.value, 8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Addresses ─────────────────────────────────────────────────────────────────────────── */

function AddressResults({ q, provider }: { q: ParsedQuery; provider: OnchainProvider }) {
  const evm = EVM_NETWORKS.includes(q.networks[0]);
  // EVM addresses exist on every EVM chain: look up all of them for the cross-chain table.
  const nets = evm ? q.networks : q.networks.slice(0, 1);
  const st = useLookup(nets, (n) => provider.getAddress(n, q.value), [q.value, nets.join(), provider]);
  const [active, setActive] = useState<NetworkId | null>(null);
  if (st.loading) return <Loading />;
  if (!st.found.length) return <NotFound what="account" error={st.error} />;
  const cur = st.found.find((f) => f.network === active) ?? st.found[0];
  return (
    <>
      <AddressView a={cur.data} provider={provider} />
      {evm && st.found.length > 1 && <CrossChain found={st.found} active={cur.network} onPick={setActive} />}
    </>
  );
}

function CrossChain({ found, active, onPick }: { found: Found<AddressDetail>[]; active: NetworkId; onPick: (n: NetworkId) => void }) {
  const prices = usePrices();
  return (
    <div className="oc-card" data-testid="oc-crosschain">
      <div className="oc-card-head">
        <span className="oc-kind">Same address across EVM networks</span>
      </div>
      <table className="oc-table">
        <thead>
          <tr>
            <th>Network</th>
            <th className="r">Native balance</th>
            <th className="r">USD</th>
            <th className="r">Tokens</th>
            <th className="r">Txs</th>
          </tr>
        </thead>
        <tbody>
          {found.map(({ network, data }) => {
            const nt = nativeToken(network);
            const p = usdPrice(nt, prices);
            return (
              <tr key={network} className={`oc-click ${network === active ? 'on' : ''}`} onClick={() => onPick(network)}>
                <td>
                  <NetBadge id={network} />
                </td>
                <td className="r mono">
                  {fmtAmount(data.balance)} {nt.symbol}
                </td>
                <td className="r faint">{p != null ? fmtUsdShort(data.balance * p) : '—'}</td>
                <td className="r mono">{data.holdings ? data.holdings.length : '—'}</td>
                <td className="r mono">{data.txCount != null ? data.txCount.toLocaleString('en-US') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddressView({ a, provider }: { a: AddressDetail; provider: OnchainProvider }) {
  const labels = useLabels();
  const prices = usePrices();
  const n = NETWORK[a.network];
  const nt = nativeToken(a.network);
  const p = usdPrice(nt, prices);
  const label = labelFor(a.address, a.network, labels);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label?.source === 'user' ? label.name : '');
  const { addRule, setLabel, removeLabel } = useOnchainStore.getState();
  const holdingsUsd = (a.holdings ?? []).reduce((s, h) => s + h.amount * (usdPrice(h.token, prices) ?? 0), 0);
  const tokenRef = a.contract?.token ?? findToken(a.network, a.address) ?? null;

  return (
    <div className="oc-card" data-testid="oc-address">
      <div className="oc-card-head">
        <span className={`oc-pill ${a.kind === 'contract' ? 's-contract' : 's-wallet'}`}>{a.kind === 'contract' ? 'Contract' : 'Wallet'}</span>
        <NetBadge id={a.network} />
        {label && (
          <span className={`oc-ent e-${label.type}`} title={ENTITY_LABEL[label.type]}>
            {label.name}
          </span>
        )}
        <span className="mono oc-hash" title={a.address}>
          {short(a.address, 10, 8)}
        </span>
        <CopyBtn text={a.address} />
        <span className="spacer" />
        <button className="btn sm" onClick={() => setEditing((v) => !v)} data-testid="oc-label-btn">
          <Tag size={12} /> Label
        </button>
        <button
          className="btn sm"
          data-testid="oc-watch-wallet"
          onClick={() => {
            addRule({ kind: 'wallet', network: a.network, address: a.address, name: label?.name, direction: 'any', minUsd: 100_000 });
            toast({ kind: 'success', title: 'Watching wallet', detail: `${label?.name ?? short(a.address)} on ${n.name} · moves ≥ $100K` });
          }}
        >
          <Bell size={12} /> Watch
        </button>
        <ExtLink href={n.explorer.address(a.address)} label={n.explorer.name} />
      </div>
      {editing && (
        <form
          className="oc-label-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setLabel({ address: a.address, network: '*', name: name.trim(), type: 'wallet' });
            else removeLabel(a.address);
            setEditing(false);
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your label, e.g. ‘OTC desk’ (empty to remove)" autoFocus aria-label="Address label" data-testid="oc-label-input" />
          <button className="btn sm primary" type="submit">
            Save
          </button>
        </form>
      )}
      <div className="oc-grid">
        <KV k="Balance" testId="oc-balance">
          <span className="mono">
            {fmtAmount(a.balance)} {nt.symbol}
          </span>
          {p != null && <span className="faint"> · {fmtUsdShort(a.balance * p)}</span>}
        </KV>
        <KV k={n.kind === 'evm' ? 'Transactions sent' : 'Transactions'}>{a.txCount != null ? a.txCount.toLocaleString('en-US') : '—'}</KV>
        <KV k="Token value">{a.holdings ? fmtUsdShort(holdingsUsd) : '—'}</KV>
        <KV k="First seen">{a.firstSeen ? `${fmtDate(a.firstSeen)} · ${ago(a.firstSeen)}` : '—'}</KV>
        <KV k="Last active">{a.lastSeen ? ago(a.lastSeen) : '—'}</KV>
      </div>

      {a.contract && (
        <div className="oc-contract" data-testid="oc-contract">
          <div className="oc-sub">Contract</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="oc-pill s-contract">{a.contract.standard}</span>
            {a.contract.verified != null && <span className={`oc-pill ${a.contract.verified ? 's-success' : 's-failed'}`}>{a.contract.verified ? 'Verified source' : 'Unverified'}</span>}
            {a.contract.name && <span>{a.contract.name}</span>}
            {tokenRef && (
              <Link className="btn sm" to={searchHref(tokenRef.symbol, a.network)}>
                Open token
              </Link>
            )}
          </div>
          {a.contract.reads.length > 0 && (
            <div className="oc-reads">
              <span className="label">Supported reads</span>
              {a.contract.reads.map((r) => (
                <code key={r}>{r}</code>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="oc-two">
      <section>
      <div className="oc-sub">Token holdings</div>
      {a.holdings == null ? (
        <SourceNote>{n.caps.tokens ? 'Token balances need an indexer for this chain.' : `${n.name} has no token contracts — balance above is the native asset.`}</SourceNote>
      ) : a.holdings.length === 0 ? (
        <div className="oc-empty sm">{provider.id === 'live' && n.kind === 'evm' ? 'None of the well-known tokens are held. (Public RPC can only check specific tokens.)' : 'No token balances.'}</div>
      ) : (
        <table className="oc-table" data-testid="oc-holdings">
          <tbody>
            {a.holdings.map((h) => {
              const pp = usdPrice(h.token, prices);
              return (
                <tr key={h.token.address || h.token.symbol}>
                  <td>
                    <span className="oc-sym">{h.token.symbol}</span> <span className="faint">{h.token.name}</span>
                  </td>
                  <td className="r mono">{fmtAmount(h.amount)}</td>
                  <td className="r faint">{pp != null ? fmtUsdShort(h.amount * pp) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      </section>
      <section>
      <div className="oc-sub">Recent activity</div>
      {a.activity == null ? (
        <SourceNote>Transaction history isn’t available from a public RPC node — it needs an indexer. Use {n.explorer.name} for the full history.</SourceNote>
      ) : a.activity.length === 0 ? (
        <div className="oc-empty sm">No transactions.</div>
      ) : (
        <table className="oc-table" data-testid="oc-activity">
          <tbody>
            {a.activity.map((x) => (
              <tr key={x.hash}>
                <td className="faint mono">{ago(x.time)}</td>
                <td>
                  <span className={`oc-dir d-${x.direction}`}>{x.direction === 'in' ? 'IN' : x.direction === 'out' ? 'OUT' : x.direction === 'self' ? 'SELF' : 'TX'}</span>
                </td>
                <td>{x.counterparty ? <Addr a={x.counterparty} network={a.network} labels={labels} head={5} /> : <span className="faint">—</span>}</td>
                <td className="r mono">{x.amount ? `${fmtAmount(x.amount)} ${x.symbol}` : ''}</td>
                <td>
                  <Link to={searchHref(x.hash, a.network)} className="mono faint">
                    {short(x.hash, 6, 4)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </section>
      </div>
    </div>
  );
}

/* ── Blocks ────────────────────────────────────────────────────────────────────────────── */

function BlockResults({ q, provider }: { q: ParsedQuery; provider: OnchainProvider }) {
  const [active, setActive] = useState<NetworkId | null>(null);
  // Parent re-mounts results per query, so this starts at the searched height.
  const [height, setHeight] = useState<string>(q.value);
  const nets = active ? [active] : q.networks;
  const st = useLookup(nets, (n) => provider.getBlock(n, /^\d+$/.test(height) ? Number(height) : height), [height, nets.join(), provider]);
  if (st.loading) return <Loading />;
  if (!st.found.length) return <NotFound what="block" error={st.error} />;
  const cur = st.found[0];
  return (
    <>
      {q.networks.length > 1 && (
        <div className="oc-tabs" role="tablist" aria-label="Network">
          {q.networks.map((n) => (
            <button key={n} role="tab" aria-selected={n === cur.network} className={n === cur.network ? 'on' : ''} onClick={() => setActive(n)}>
              <NetBadge id={n} compact />
            </button>
          ))}
        </div>
      )}
      <BlockView b={cur.data} onStep={(d) => setHeight(String(cur.data.height + d))} />
    </>
  );
}

function BlockView({ b, onStep }: { b: BlockDetail; onStep: (d: number) => void }) {
  const labels = useLabels();
  const n = NETWORK[b.network];
  const nt = nativeToken(b.network);
  const fill = b.gasUsed != null && b.gasLimit ? b.gasUsed / b.gasLimit : null;
  return (
    <div className="oc-card" data-testid="oc-block">
      <div className="oc-card-head">
        <span className="oc-kind">Block</span>
        <NetBadge id={b.network} />
        <button className="oc-icon" aria-label="Previous block" onClick={() => onStep(-1)}>
          <ChevronLeft size={13} />
        </button>
        <span className="mono oc-height" data-testid="oc-block-height">
          {b.height.toLocaleString('en-US')}
        </span>
        <button className="oc-icon" aria-label="Next block" onClick={() => onStep(1)}>
          <ChevronRight size={13} />
        </button>
        <span className="spacer" />
        <ExtLink href={n.explorer.block(b.height)} label={n.explorer.name} />
      </div>
      <div className="oc-grid">
        <KV k="Hash">
          <span className="mono" title={b.hash}>
            {short(b.hash, 12, 8)}
          </span>
          <CopyBtn text={b.hash} />
        </KV>
        <KV k="Time">{`${fmtDate(b.time)} ${fmtTime(b.time)} · ${ago(b.time)}`}</KV>
        <KV k="Transactions">{b.txCount.toLocaleString('en-US')}</KV>
        <KV k={n.kind === 'utxo' ? 'Mined by' : 'Producer'}>{b.producer ? b.producer.length > 30 ? <Addr a={b.producer} network={b.network} labels={labels} /> : b.producer : '—'}</KV>
        {fill != null && (
          <KV k="Gas used">
            <span className="mono">{(fill * 100).toFixed(1)}%</span>
            <span className="oc-meter" aria-hidden>
              <span style={{ width: `${fill * 100}%` }} />
            </span>
          </KV>
        )}
        {b.baseFee != null && <KV k="Base fee">{`${b.baseFee.toFixed(2)} gwei`}</KV>}
        {b.sizeBytes != null && <KV k="Size">{`${(b.sizeBytes / 1024).toFixed(0)} KB`}</KV>}
        {b.reward != null && <KV k="Reward">{`${b.reward.toFixed(4)} ${nt.symbol}`}</KV>}
      </div>
      {b.topTxs && b.topTxs.length > 0 && (
        <>
          <div className="oc-sub">Largest transfers in block</div>
          <table className="oc-table">
            <tbody>
              {b.topTxs.map((t) => (
                <tr key={t.hash}>
                  <td>
                    <Link to={searchHref(t.hash, b.network)} className="mono">
                      {short(t.hash, 8, 6)}
                    </Link>
                  </td>
                  <td>
                    <Addr a={t.from} network={b.network} labels={labels} head={5} /> <span className="faint">→</span> <Addr a={t.to} network={b.network} labels={labels} head={5} />
                  </td>
                  <td className="r mono">
                    {fmtAmount(t.value)} {nt.symbol}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/* ── Tokens ────────────────────────────────────────────────────────────────────────────── */

function TokenSearch({ q, provider }: { q: ParsedQuery; provider: OnchainProvider }) {
  const only = q.networks.length === 1 ? q.networks[0] : null;
  const matches = useMemo(() => searchTokens(q.value, only).filter((t) => q.networks.includes(t.network)), [q.value, only, q.networks]);
  const [pick, setPick] = useState<TokenRef | null>(null);
  const chosen = pick ?? (matches.length === 1 ? matches[0] : null);
  if (!matches.length) return <NotFound what={`token matching “${q.value}”`} />;
  return (
    <>
      {matches.length > 1 && (
        <div className="oc-card" data-testid="oc-token-list">
          <div className="oc-card-head">
            <span className="oc-kind">{matches.length} tokens match “{q.value}”</span>
          </div>
          <table className="oc-table">
            <tbody>
              {matches.map((t) => (
                <tr key={t.network + t.address} className={`oc-click ${chosen === t ? 'on' : ''}`} onClick={() => setPick(t)} data-testid="oc-token-row">
                  <td>
                    <span className="oc-sym">{t.symbol}</span> <span className="faint">{t.name}</span>
                  </td>
                  <td>
                    <NetBadge id={t.network} />
                  </td>
                  <td className="mono faint">{short(t.address, 8, 6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chosen && <TokenLoader key={chosen.network + chosen.address} token={chosen} provider={provider} />}
    </>
  );
}

function TokenLoader({ token, provider }: { token: TokenRef; provider: OnchainProvider }) {
  const st = useLookup([token.network], (n) => provider.getToken(n, token.address), [token.address, provider]);
  if (st.loading) return <Loading />;
  if (!st.found.length) return <NotFound what="token" error={st.error} />;
  return <TokenView d={st.found[0].data} live={provider.id === 'live'} />;
}

function TokenView({ d, live }: { d: TokenDetail; live: boolean }) {
  const labels = useLabels();
  const prices = usePrices();
  const n = NETWORK[d.token.network];
  const p = usdPrice(d.token, prices);
  const conc = d.top && d.totalSupply ? concentration(d.top, d.totalSupply, (a) => labelFor(a, d.token.network, labels)) : null;
  const addRule = useOnchainStore((s) => s.addRule);
  const maxShare = Math.max(...(d.top ?? []).map((h) => h.amount / (d.totalSupply || 1)), 0.0001);
  const hhiTone = conc ? (conc.hhi > 2500 ? 'Highly concentrated' : conc.hhi > 1500 ? 'Moderately concentrated' : 'Unconcentrated') : '';
  return (
    <div className="oc-card" data-testid="oc-token">
      <div className="oc-card-head">
        <span className="oc-kind">Token</span>
        <span className="oc-sym lg">{d.token.symbol}</span>
        <span>{d.token.name}</span>
        <NetBadge id={d.token.network} />
        <span className="mono faint" title={d.token.address}>
          {short(d.token.address, 8, 6)}
        </span>
        <CopyBtn text={d.token.address} />
        <span className="spacer" />
        <button
          className="btn sm"
          data-testid="oc-watch-token"
          onClick={() => {
            addRule({ kind: 'token_activity', network: d.token.network, tokenAddress: d.token.address, symbol: d.token.symbol, metric: 'count', z: 4 });
            toast({ kind: 'success', title: 'Alert added', detail: `Unusual ${d.token.symbol} activity on ${n.name} (≥ 4σ transfers / min)` });
          }}
        >
          <Activity size={12} /> Alert on unusual activity
        </button>
        {n.explorer.token && <ExtLink href={n.explorer.token(d.token.address)} label={n.explorer.name} />}
      </div>
      <div className="oc-grid">
        <KV k="Total supply" testId="oc-supply">
          <span className="mono">{fmtAmount(d.totalSupply)}</span>
          {p != null && d.totalSupply != null && <span className="faint"> · {fmtUsdShort(d.totalSupply * p)}</span>}
        </KV>
        <KV k="Holders">{d.holders != null ? d.holders.toLocaleString('en-US') : '—'}</KV>
        <KV k="Transfers 24h">{d.transfers24h != null ? d.transfers24h.toLocaleString('en-US') : '—'}</KV>
        <KV k="Volume 24h">{d.volume24h != null ? (p != null ? fmtUsdShort(d.volume24h * p) : fmtAmount(d.volume24h)) : '—'}</KV>
        <KV k="Decimals">{d.token.decimals}</KV>
        <KV k="Standard">{d.contract ? `${d.contract.standard}${d.contract.verified ? ' · verified' : ''}` : '—'}</KV>
      </div>

      <div className="oc-sub">Holder concentration</div>
      {!conc ? (
        <SourceNote>
          {live && n.kind === 'evm'
            ? 'Holder lists need an indexer — a public RPC node can’t enumerate holders. Supply above is live from the contract.'
            : 'Holder data isn’t available for this token from the current source.'}
        </SourceNote>
      ) : (
        <div className="oc-conc" data-testid="oc-concentration">
          <div className="oc-conc-stats">
            <div>
              <span className="label">Top 10 hold</span>
              <span className="num">{(conc.top10 * 100).toFixed(1)}%</span>
            </div>
            <div title="Herfindahl–Hirschman index over the listed holders (0–10,000)">
              <span className="label">HHI</span>
              <span className="num">{Math.round(conc.hhi).toLocaleString('en-US')}</span>
              <span className="faint oc-conc-note">{hhiTone}</span>
            </div>
            <div>
              <span className="label">Holders to 50%</span>
              <span className="num">{conc.majority ?? `> ${d.top!.length}`}</span>
            </div>
            <div>
              <span className="label">On exchanges</span>
              <span className="num">{(conc.onExchanges * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="oc-holders" role="table" aria-label="Top holders">
            {d.top!.slice(0, 12).map((h, i) => {
              const l = labelFor(h.address, d.token.network, labels);
              const share = h.amount / (d.totalSupply || 1);
              return (
                <div key={h.address + i} className="oc-holder" role="row" title={`${h.address} · ${fmtAmount(h.amount)} ${d.token.symbol}`}>
                  <span className="oc-holder-rank mono faint">{i + 1}</span>
                  <span className="oc-holder-who">{l ? <span className={`oc-ent e-${l.type}`}>{l.name}</span> : <Link to={searchHref(h.address, d.token.network)} className="mono">{short(h.address, 6, 4)}</Link>}</span>
                  <span className="oc-holder-bar">
                    <span style={{ width: `${(share / maxShare) * 100}%` }} />
                  </span>
                  <span className="oc-holder-pct mono">{(share * 100).toFixed(2)}%</span>
                </div>
              );
            })}
          </div>
          <span className="faint oc-conc-foot">
            {live ? 'Largest token accounts from RPC (an owner can control several accounts).' : 'Among the listed top holders; the long tail isn’t included.'} Labels show exchanges, bridges and treasuries where known.
          </span>
        </div>
      )}
    </div>
  );
}
