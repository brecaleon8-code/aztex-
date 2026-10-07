/**
 * Deposit routing for the "Add crypto" flow: which networks each asset can arrive on, the rules for
 * each network, and a deterministic per-account address in that network's real format.
 *
 * The addresses are SIMULATED (derived from a hash, not keys) and must never be used to receive
 * funds. Production replaces `depositAddress` with a call to the custody provider, which returns a
 * monitored address (and memo/tag) per account.
 */
import { hashSeed, mulberry32 } from '@/lib/mock/rng';

export interface DepositNetwork {
  id: string;
  label: string;
  /** Address family → format. */
  family: 'btc' | 'evm' | 'sol' | 'xrp' | 'cosmos' | 'ada' | 'doge' | 'ltc' | 'dot' | 'tron';
  confirmations: number;
  etaMin: number;
  /** Some networks route to a shared address and need a memo/tag to credit the right account. */
  memo?: 'Destination tag' | 'Memo';
}

const NET: Record<string, DepositNetwork> = {
  bitcoin: { id: 'bitcoin', label: 'Bitcoin', family: 'btc', confirmations: 2, etaMin: 20 },
  ethereum: { id: 'ethereum', label: 'Ethereum (ERC-20)', family: 'evm', confirmations: 12, etaMin: 3 },
  arbitrum: { id: 'arbitrum', label: 'Arbitrum One', family: 'evm', confirmations: 20, etaMin: 2 },
  base: { id: 'base', label: 'Base', family: 'evm', confirmations: 20, etaMin: 2 },
  solana: { id: 'solana', label: 'Solana', family: 'sol', confirmations: 32, etaMin: 1 },
  xrpl: { id: 'xrpl', label: 'XRP Ledger', family: 'xrp', confirmations: 1, etaMin: 1, memo: 'Destination tag' },
  doge: { id: 'doge', label: 'Dogecoin', family: 'doge', confirmations: 20, etaMin: 20 },
  avaxc: { id: 'avaxc', label: 'Avalanche C-Chain', family: 'evm', confirmations: 12, etaMin: 1 },
  cardano: { id: 'cardano', label: 'Cardano', family: 'ada', confirmations: 15, etaMin: 5 },
  polygon: { id: 'polygon', label: 'Polygon PoS', family: 'evm', confirmations: 128, etaMin: 5 },
  polkadot: { id: 'polkadot', label: 'Polkadot', family: 'dot', confirmations: 2, etaMin: 2 },
  litecoin: { id: 'litecoin', label: 'Litecoin', family: 'ltc', confirmations: 6, etaMin: 15 },
  cosmos: { id: 'cosmos', label: 'Cosmos Hub', family: 'cosmos', confirmations: 1, etaMin: 1, memo: 'Memo' },
  tron: { id: 'tron', label: 'Tron (TRC-20)', family: 'tron', confirmations: 20, etaMin: 2 },
};

export interface DepositAsset {
  symbol: string;
  name: string;
  networks: DepositNetwork[];
  minDeposit: number;
}

export const DEPOSIT_ASSETS: DepositAsset[] = [
  { symbol: 'USDT', name: 'Tether USD', networks: [NET.ethereum, NET.tron, NET.solana, NET.arbitrum], minDeposit: 10 },
  { symbol: 'USDC', name: 'USD Coin', networks: [NET.ethereum, NET.solana, NET.base, NET.arbitrum], minDeposit: 10 },
  { symbol: 'BTC', name: 'Bitcoin', networks: [NET.bitcoin], minDeposit: 0.0001 },
  { symbol: 'ETH', name: 'Ethereum', networks: [NET.ethereum, NET.arbitrum, NET.base], minDeposit: 0.002 },
  { symbol: 'SOL', name: 'Solana', networks: [NET.solana], minDeposit: 0.05 },
  { symbol: 'XRP', name: 'XRP', networks: [NET.xrpl], minDeposit: 10 },
  { symbol: 'DOGE', name: 'Dogecoin', networks: [NET.doge], minDeposit: 30 },
  { symbol: 'AVAX', name: 'Avalanche', networks: [NET.avaxc], minDeposit: 0.2 },
  { symbol: 'LINK', name: 'Chainlink', networks: [NET.ethereum, NET.arbitrum], minDeposit: 0.5 },
  { symbol: 'ADA', name: 'Cardano', networks: [NET.cardano], minDeposit: 5 },
  { symbol: 'MATIC', name: 'Polygon', networks: [NET.polygon, NET.ethereum], minDeposit: 5 },
  { symbol: 'DOT', name: 'Polkadot', networks: [NET.polkadot], minDeposit: 1 },
  { symbol: 'LTC', name: 'Litecoin', networks: [NET.litecoin], minDeposit: 0.01 },
  { symbol: 'ATOM', name: 'Cosmos', networks: [NET.cosmos], minDeposit: 0.5 },
];

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const HEX = '0123456789abcdef';

export interface DepositInstructions {
  address: string;
  memo?: { label: string; value: string };
  simulated: true;
}

/** Deterministic, network-correct-looking address for (account, asset, network). Simulated. */
export function depositAddress(accountId: string, asset: string, network: DepositNetwork): DepositInstructions {
  // Same network → same address across assets (as with real custody), except memo networks.
  const rand = mulberry32(hashSeed(`${accountId}:${network.family}:${network.id}`));
  const s = (alpha: string, n: number) => Array.from({ length: n }, () => alpha[Math.floor(rand() * alpha.length)]).join('');
  let address: string;
  switch (network.family) {
    case 'btc':
      address = 'bc1q' + s(B32, 38);
      break;
    case 'ltc':
      address = 'ltc1q' + s(B32, 38);
      break;
    case 'evm':
      address = '0x' + s(HEX, 40);
      break;
    case 'sol':
      address = s(B58, 44);
      break;
    case 'xrp':
      address = 'r' + s(B58, 33);
      break;
    case 'doge':
      address = 'D' + s(B58, 33);
      break;
    case 'tron':
      address = 'T' + s(B58, 33);
      break;
    case 'dot':
      address = '1' + s(B58, 47);
      break;
    case 'ada':
      address = 'addr1q' + s(B32, 52);
      break;
    case 'cosmos':
      address = 'cosmos1' + s(B32, 38);
      break;
  }
  const memo = network.memo ? { label: network.memo, value: String(100_000_000 + (hashSeed(accountId + asset) % 900_000_000)) } : undefined;
  return { address, memo, simulated: true };
}

export function depositAsset(symbol: string): DepositAsset | undefined {
  return DEPOSIT_ASSETS.find((a) => a.symbol === symbol);
}
