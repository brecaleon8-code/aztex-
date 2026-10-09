import type { Network, NetworkId } from './types';

/** Networks the scanner covers. Capabilities say what each chain can answer at all. */
export const NETWORKS: Network[] = [
  {
    id: 'ethereum', name: 'Ethereum', short: 'Ethereum', kind: 'evm', native: 'ETH', nativeDecimals: 18, blockTimeSec: 12, feeUnit: 'gwei', color: '#8C9CF2',
    caps: { tokens: true, contracts: true, holders: true },
    explorer: { name: 'Etherscan', tx: (h) => `https://etherscan.io/tx/${h}`, address: (a) => `https://etherscan.io/address/${a}`, block: (b) => `https://etherscan.io/block/${b}`, token: (a) => `https://etherscan.io/token/${a}` },
    rpc: 'https://ethereum-rpc.publicnode.com',
  },
  {
    id: 'bitcoin', name: 'Bitcoin', short: 'Bitcoin', kind: 'utxo', native: 'BTC', nativeDecimals: 8, blockTimeSec: 600, feeUnit: 'sat/vB', color: '#E8A94B',
    caps: { tokens: false, contracts: false, holders: false },
    explorer: { name: 'mempool.space', tx: (h) => `https://mempool.space/tx/${h}`, address: (a) => `https://mempool.space/address/${a}`, block: (b) => `https://mempool.space/block/${b}` },
    rpc: 'https://mempool.space/api',
  },
  {
    id: 'solana', name: 'Solana', short: 'Solana', kind: 'solana', native: 'SOL', nativeDecimals: 9, blockTimeSec: 0.4, feeUnit: 'SOL/tx', color: '#B58AF5',
    caps: { tokens: true, contracts: true, holders: true },
    explorer: { name: 'Solscan', tx: (h) => `https://solscan.io/tx/${h}`, address: (a) => `https://solscan.io/account/${a}`, block: (b) => `https://solscan.io/block/${b}`, token: (a) => `https://solscan.io/token/${a}` },
    rpc: 'https://api.mainnet-beta.solana.com',
  },
  {
    id: 'arbitrum', name: 'Arbitrum One', short: 'Arbitrum', kind: 'evm', native: 'ETH', nativeDecimals: 18, blockTimeSec: 0.25, feeUnit: 'gwei', color: '#6FA8DC',
    caps: { tokens: true, contracts: true, holders: true },
    explorer: { name: 'Arbiscan', tx: (h) => `https://arbiscan.io/tx/${h}`, address: (a) => `https://arbiscan.io/address/${a}`, block: (b) => `https://arbiscan.io/block/${b}`, token: (a) => `https://arbiscan.io/token/${a}` },
    rpc: 'https://arbitrum-one-rpc.publicnode.com',
  },
  {
    id: 'base', name: 'Base', short: 'Base', kind: 'evm', native: 'ETH', nativeDecimals: 18, blockTimeSec: 2, feeUnit: 'gwei', color: '#5B8DEF',
    caps: { tokens: true, contracts: true, holders: true },
    explorer: { name: 'Basescan', tx: (h) => `https://basescan.org/tx/${h}`, address: (a) => `https://basescan.org/address/${a}`, block: (b) => `https://basescan.org/block/${b}`, token: (a) => `https://basescan.org/token/${a}` },
    rpc: 'https://base-rpc.publicnode.com',
  },
  {
    id: 'polygon', name: 'Polygon PoS', short: 'Polygon', kind: 'evm', native: 'POL', nativeDecimals: 18, blockTimeSec: 2, feeUnit: 'gwei', color: '#A07CE0',
    caps: { tokens: true, contracts: true, holders: true },
    explorer: { name: 'Polygonscan', tx: (h) => `https://polygonscan.com/tx/${h}`, address: (a) => `https://polygonscan.com/address/${a}`, block: (b) => `https://polygonscan.com/block/${b}`, token: (a) => `https://polygonscan.com/token/${a}` },
    rpc: 'https://polygon-bor-rpc.publicnode.com',
  },
  {
    id: 'bnb', name: 'BNB Smart Chain', short: 'BNB Chain', kind: 'evm', native: 'BNB', nativeDecimals: 18, blockTimeSec: 3, feeUnit: 'gwei', color: '#D9B44A',
    caps: { tokens: true, contracts: true, holders: true },
    explorer: { name: 'BscScan', tx: (h) => `https://bscscan.com/tx/${h}`, address: (a) => `https://bscscan.com/address/${a}`, block: (b) => `https://bscscan.com/block/${b}`, token: (a) => `https://bscscan.com/token/${a}` },
    rpc: 'https://bsc-rpc.publicnode.com',
  },
  {
    id: 'tron', name: 'Tron', short: 'Tron', kind: 'tron', native: 'TRX', nativeDecimals: 6, blockTimeSec: 3, feeUnit: 'sun', color: '#E06C6C',
    caps: { tokens: true, contracts: true, holders: true },
    explorer: { name: 'Tronscan', tx: (h) => `https://tronscan.org/#/transaction/${h}`, address: (a) => `https://tronscan.org/#/address/${a}`, block: (b) => `https://tronscan.org/#/block/${b}`, token: (a) => `https://tronscan.org/#/token20/${a}` },
  },
];

export const NETWORK: Record<NetworkId, Network> = Object.fromEntries(NETWORKS.map((n) => [n.id, n])) as Record<NetworkId, Network>;
export const EVM_NETWORKS = NETWORKS.filter((n) => n.kind === 'evm').map((n) => n.id);
