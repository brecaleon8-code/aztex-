import type { NetworkId, ParsedQuery } from './types';
import { EVM_NETWORKS } from './networks';

const B58 = '[1-9A-HJ-NP-Za-km-z]';

/**
 * Recognise what the user pasted: a transaction hash, an address, a block, a token or a name —
 * and which networks it could belong to. Formats are unambiguous for most chains; a bare 64-hex
 * string could be a Bitcoin txid or block hash, and a number is a block height on any chain.
 */
export function parseQuery(raw: string, only?: NetworkId | null): ParsedQuery | null {
  const q = raw.trim();
  if (!q) return null;
  const within = (ns: NetworkId[]) => (only ? ns.filter((n) => n === only) : ns);
  let r: ParsedQuery | null = null;

  if (/^0x[0-9a-fA-F]{64}$/.test(q)) r = { kind: 'tx', value: q.toLowerCase(), networks: EVM_NETWORKS, hint: 'EVM transaction hash' };
  else if (/^0x[0-9a-fA-F]{40}$/.test(q)) r = { kind: 'address', value: q, networks: EVM_NETWORKS, hint: 'EVM address — same address on every EVM chain' };
  else if (/^0{8}[0-9a-fA-F]{56}$/.test(q)) r = { kind: 'block', value: q.toLowerCase(), networks: ['bitcoin'], hint: 'Bitcoin block hash' };
  else if (/^[0-9a-fA-F]{64}$/.test(q)) r = { kind: 'tx', value: q.toLowerCase(), networks: ['bitcoin', 'tron'], hint: 'Bitcoin / Tron transaction id' };
  else if (/^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(q)) r = { kind: 'address', value: q, networks: ['bitcoin'], hint: 'Bitcoin address' };
  else if (new RegExp(`^T${B58}{33}$`).test(q)) r = { kind: 'address', value: q, networks: ['tron'], hint: 'Tron address' };
  else if (new RegExp(`^${B58}{80,90}$`).test(q)) r = { kind: 'tx', value: q, networks: ['solana'], hint: 'Solana transaction signature' };
  else if (new RegExp(`^${B58}{32,44}$`).test(q)) r = { kind: 'address', value: q, networks: ['solana'], hint: 'Solana account or token mint' };
  else if (/^\d{1,10}$/.test(q)) r = { kind: 'block', value: q, networks: ['ethereum', 'bitcoin', 'solana', 'arbitrum', 'base', 'polygon', 'bnb', 'tron'], hint: 'Block height' };
  else if (/^[a-z0-9-]+\.eth$/i.test(q)) r = { kind: 'name', value: q.toLowerCase(), networks: ['ethereum'], hint: 'ENS name' };
  else if (/^[A-Za-z0-9$.\- ]{1,24}$/.test(q)) r = { kind: 'token', value: q.replace(/^\$/, ''), networks: ['ethereum', 'solana', 'arbitrum', 'base', 'polygon', 'bnb', 'tron'], hint: 'Token name or symbol' };

  if (!r) return null;
  const networks = within(r.networks);
  if (only && networks.length === 0) return { ...r, networks: [], hint: `${r.hint} — not valid on the selected network` };
  return { ...r, networks };
}

/** Shorten an address/hash for display: 0x28c6…1d60 */
export function short(s: string, head = 6, tail = 4): string {
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}
