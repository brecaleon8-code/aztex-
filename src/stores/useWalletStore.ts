import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const STARTING_BALANCE = 25_000;

export interface DepositRecord {
  id: string;
  asset: string;
  network: string;
  amount: number;
  confirmations: number;
  required: number;
  status: 'confirming' | 'credited';
  createdAt: number;
}

interface WalletState {
  /** Free USDT (not committed to open positions). */
  balance: number;
  /** Non-USDT crypto balances (from deposits), by symbol. */
  holdings: Record<string, number>;
  deposits: DepositRecord[];
  upsertDeposit: (d: DepositRecord) => void;
  /** Credit an arrived deposit: USDT to the trading balance, everything else to holdings. */
  credit: (asset: string, amount: number) => void;
  /** Move `amount` of a holding into USDT at `proceeds` (already net of fees). */
  convert: (asset: string, amount: number, proceeds: number) => boolean;
  deposit: (amount: number) => boolean;
  withdraw: (amount: number) => boolean;
  /** Commit notional to a new position. Returns false if insufficient. */
  reserve: (amount: number) => boolean;
  /** Return notional + realized P/L when a position closes. */
  settle: (amount: number) => void;
}

/**
 * Mock wallet. A real build replaces this with custody / on-chain integration, which needs its
 * own security review (spec §9) — nothing here is safe to reuse for real funds.
 */
export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      holdings: {},
      deposits: [],
      upsertDeposit: (d) => set((s) => ({ deposits: s.deposits.some((x) => x.id === d.id) ? s.deposits.map((x) => (x.id === d.id ? d : x)) : [d, ...s.deposits].slice(0, 50) })),
      credit: (asset, amount) =>
        set((s) => (asset === 'USDT' ? { balance: s.balance + amount } : { holdings: { ...s.holdings, [asset]: (s.holdings[asset] ?? 0) + amount } })),
      convert: (asset, amount, proceeds) => {
        const have = get().holdings[asset] ?? 0;
        if (!(amount > 0) || amount > have + 1e-12) return false;
        set((s) => {
          const holdings = { ...s.holdings, [asset]: have - amount };
          if (holdings[asset] < 1e-12) delete holdings[asset];
          return { holdings, balance: s.balance + proceeds };
        });
        return true;
      },
      deposit: (amount) => {
        if (!(amount > 0) || !Number.isFinite(amount)) return false;
        set((s) => ({ balance: s.balance + amount }));
        return true;
      },
      withdraw: (amount) => {
        if (!(amount > 0) || amount > get().balance) return false;
        set((s) => ({ balance: s.balance - amount }));
        return true;
      },
      reserve: (amount) => {
        if (!(amount > 0) || amount > get().balance + 1e-9) return false;
        set((s) => ({ balance: s.balance - amount }));
        return true;
      },
      settle: (amount) => set((s) => ({ balance: Math.max(0, s.balance + amount) })),
    }),
    { name: 'aztex.wallet' },
  ),
);
