import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, ExternalLink } from 'lucide-react';
import type { Label, NetworkId } from '@/lib/onchain/types';
import { NETWORK } from '@/lib/onchain/networks';
import { labelFor, ENTITY_LABEL } from '@/lib/onchain/labels';
import { simLabels } from '@/lib/onchain/sim';
import { findToken } from '@/lib/onchain/tokens';
import { short } from '@/lib/onchain/query';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { useMarketStore } from '@/stores/useMarketStore';

const SIM = simLabels();

/** All labels in effect: the user's, then simulator entities (Simulated mode), then built-ins. */
export function useLabels(): Label[] {
  const user = useOnchainStore((s) => s.labels);
  const mode = useOnchainStore((s) => s.mode);
  return mode === 'sim' ? [...user, ...SIM] : user;
}

export function usePrices(): Record<string, number> {
  const assets = useMarketStore((s) => s.assets);
  const out: Record<string, number> = {};
  for (const a of Object.values(assets)) out[a.symbol] = a.price;
  return out;
}

export const searchHref = (q: string, net?: NetworkId | null) => `/onchain?q=${encodeURIComponent(q)}${net ? `&net=${net}` : ''}`;

export function fmtUsdShort(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(0);
  return `${v < 0 ? '−' : ''}$${s}`;
}

export function fmtAmount(v: number | null | undefined, max = 4): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 0 : a >= 1 ? 2 : max });
}

export function ago(t: number | null | undefined, now = Date.now()): string {
  if (t == null) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NetBadge({ id, compact }: { id: NetworkId; compact?: boolean }) {
  const n = NETWORK[id];
  return (
    <span className="oc-net" title={n.name}>
      <i style={{ background: n.color }} />
      {compact ? n.short : n.name}
    </span>
  );
}

export function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="oc-icon"
      aria-label="Copy"
      title="Copy"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        });
      }}
    >
      {ok ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

export function ExtLink({ href, label }: { href: string; label?: string }) {
  return (
    <a className="oc-ext" href={href} target="_blank" rel="noreferrer noopener" title={label ? `Open in ${label}` : 'Open in explorer'}>
      {label && <span>{label}</span>}
      <ExternalLink size={11} />
    </a>
  );
}

/** An address with its label chip, linked to a scanner search; copy button. */
export function Addr({ a, network, labels, head = 6 }: { a: string | null | undefined; network: NetworkId; labels: Label[]; head?: number }) {
  if (!a) return <span className="faint">—</span>;
  const l = labelFor(a, network, labels);
  const tok = !l ? findToken(network, a) : undefined;
  return (
    <span className="oc-addr">
      {tok && (
        <span className="oc-ent e-contract" title={`${tok.name} token contract`}>
          {tok.symbol} contract
        </span>
      )}
      {l && (
        <span className={`oc-ent e-${l.type}`} title={`${ENTITY_LABEL[l.type]} · ${l.source === 'user' ? 'your label' : l.source === 'sim' ? 'simulated label' : 'built-in label'}`}>
          {l.name}
        </span>
      )}
      <Link to={searchHref(a, network)} className="mono oc-addr-link" title={a}>
        {short(a, head, 4)}
      </Link>
      <CopyBtn text={a} />
    </span>
  );
}

export function KV({ k, children, testId }: { k: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="oc-kv" data-testid={testId}>
      <span className="label">{k}</span>
      <span className="oc-kv-v">{children}</span>
    </div>
  );
}

/** Honest data-source banner: what's simulated, what's live, what needs an indexer. */
export function SourceNote({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={`oc-note ${tone}`}>{children}</div>;
}
