import type { EntityType, Label, NetworkId } from './types';

/**
 * A deliberately small built-in label set: widely published exchange wallets. Production uses a
 * maintained label provider; users can add their own labels, which take precedence.
 */
export const BUILTIN_LABELS: Label[] = [
  { address: '0x28C6c06298d514Db089934071355E5743bf21d60', network: '*', name: 'Binance 14', type: 'exchange', source: 'builtin' },
  { address: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', network: '*', name: 'Binance 15', type: 'exchange', source: 'builtin' },
  { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', network: '*', name: 'Binance 16', type: 'exchange', source: 'builtin' },
  { address: '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3', network: '*', name: 'Coinbase 1', type: 'exchange', source: 'builtin' },
  { address: '0x503828976D22510aad0201ac7EC88293211D23Da', network: '*', name: 'Coinbase 2', type: 'exchange', source: 'builtin' },
  { address: '0x000000000000000000000000000000000000dEaD', network: '*', name: 'Burn address', type: 'burn', source: 'builtin' },
  { address: '0x0000000000000000000000000000000000000000', network: '*', name: 'Null address', type: 'burn', source: 'builtin' },
];

const norm = (a: string) => (a.startsWith('0x') ? a.toLowerCase() : a);

export function labelFor(address: string, network: NetworkId, extra: Label[] = []): Label | null {
  const a = norm(address);
  // User labels first, then simulator / built-in.
  const all = [...extra.filter((l) => l.source === 'user'), ...extra.filter((l) => l.source !== 'user'), ...BUILTIN_LABELS];
  return all.find((l) => norm(l.address) === a && (l.network === '*' || l.network === network)) ?? null;
}

export const ENTITY_LABEL: Record<EntityType, string> = {
  exchange: 'Exchange',
  bridge: 'Bridge',
  defi: 'DeFi',
  fund: 'Fund',
  contract: 'Contract',
  team: 'Team / treasury',
  wallet: 'Wallet',
  burn: 'Burn',
};
