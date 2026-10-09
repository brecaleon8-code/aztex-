export type NetworkId = 'ethereum' | 'bitcoin' | 'solana' | 'arbitrum' | 'base' | 'polygon' | 'bnb' | 'tron';
export type ChainKind = 'evm' | 'utxo' | 'solana' | 'tron';

export interface Network {
  id: NetworkId;
  name: string;
  short: string;
  kind: ChainKind;
  /** Native asset symbol. */
  native: string;
  nativeDecimals: number;
  blockTimeSec: number;
  feeUnit: string;
  color: string;
  /** What lookups this network supports at all (e.g. Bitcoin has no token contracts). */
  caps: { tokens: boolean; contracts: boolean; holders: boolean };
  explorer: { name: string; tx: (h: string) => string; address: (a: string) => string; block: (b: string | number) => string; token?: (a: string) => string };
  /** Public endpoint used in Live mode (lookups only). */
  rpc?: string;
}

export type EntityType = 'exchange' | 'bridge' | 'defi' | 'fund' | 'contract' | 'team' | 'wallet' | 'burn';
export interface Label {
  address: string;
  network: NetworkId | '*';
  name: string;
  type: EntityType;
  /** Where the label comes from: built-in list, the user, or the simulator. */
  source: 'builtin' | 'user' | 'sim';
}

export interface TokenRef {
  network: NetworkId;
  symbol: string;
  name: string;
  /** Contract / mint address; empty for the native asset. */
  address: string;
  decimals: number;
  /** For USD conversion via the market feed (e.g. WETH → ETH, stablecoins → 1). */
  priceSymbol: string | null;
}

export interface TokenTransfer {
  token: TokenRef;
  from: string;
  to: string;
  amount: number;
}

export interface TxDetail {
  network: NetworkId;
  hash: string;
  status: 'success' | 'failed' | 'pending';
  block: number | null;
  time: number | null;
  confirmations: number | null;
  from: string;
  to: string | null;
  /** Native value moved. */
  value: number;
  fee: number | null;
  gasUsed?: number | null;
  gasPrice?: number | null;
  nonce?: number | null;
  /** 4-byte selector + decoded name when known. */
  method?: { selector: string; name: string | null } | null;
  transfers: TokenTransfer[];
  /** BTC-style inputs/outputs summary. */
  ins?: { address: string; value: number }[];
  outs?: { address: string; value: number }[];
  createsContract?: string | null;
}

export interface Holding {
  token: TokenRef;
  amount: number;
}

export interface ActivityItem {
  hash: string;
  time: number;
  /** 'unknown' where the source only lists signatures (e.g. Solana RPC). */
  direction: 'in' | 'out' | 'self' | 'unknown';
  counterparty: string;
  amount: number;
  symbol: string;
}

export interface AddressDetail {
  network: NetworkId;
  address: string;
  kind: 'wallet' | 'contract';
  balance: number;
  /** Tx count / nonce where the chain exposes it. */
  txCount: number | null;
  holdings: Holding[] | null;
  activity: ActivityItem[] | null;
  firstSeen: number | null;
  lastSeen: number | null;
  contract?: ContractInfo | null;
}

export interface ContractInfo {
  standard: 'ERC-20' | 'ERC-721' | 'ERC-1155' | 'Proxy' | 'Router' | 'SPL Token' | 'TRC-20' | 'Unknown';
  verified: boolean | null;
  name: string | null;
  /** Read-only functions the app can call / decode for this standard. */
  reads: string[];
  token?: TokenRef | null;
}

export interface BlockDetail {
  network: NetworkId;
  height: number;
  hash: string;
  time: number;
  txCount: number;
  producer: string | null;
  gasUsed?: number | null;
  gasLimit?: number | null;
  baseFee?: number | null;
  sizeBytes?: number | null;
  reward?: number | null;
  topTxs?: { hash: string; value: number; from: string; to: string | null }[] | null;
}

export interface HolderRow {
  address: string;
  amount: number;
  share: number;
}

export interface TokenDetail {
  token: TokenRef;
  totalSupply: number | null;
  holders: number | null;
  /** Top holders, where the data source provides them. */
  top: HolderRow[] | null;
  transfers24h: number | null;
  volume24h: number | null;
  contract: ContractInfo | null;
}

/** A transfer seen on-chain — the unit of the whale/flow monitor and alert engine. */
export interface ChainTransfer {
  id: string;
  network: NetworkId;
  hash: string;
  time: number;
  token: TokenRef;
  amount: number;
  usd: number;
  from: string;
  to: string;
}

export interface FeeSample {
  network: NetworkId;
  time: number;
  /** In the network's fee unit (gwei, sat/vB, …). */
  value: number;
}

export type QueryKind = 'tx' | 'address' | 'block' | 'token' | 'name';
export interface ParsedQuery {
  kind: QueryKind;
  value: string;
  /** Networks this query could belong to, most likely first. */
  networks: NetworkId[];
  hint: string;
}

export interface OnchainProvider {
  id: 'sim' | 'live';
  label: string;
  getTx(network: NetworkId, hash: string): Promise<TxDetail | null>;
  getAddress(network: NetworkId, address: string): Promise<AddressDetail | null>;
  getBlock(network: NetworkId, id: string | number): Promise<BlockDetail | null>;
  getToken(network: NetworkId, address: string): Promise<TokenDetail | null>;
  /** Chain tip, for confirmations and block search. */
  getTip(network: NetworkId): Promise<number | null>;
}
