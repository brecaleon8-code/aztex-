import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const STARTING_BALANCE = 25_000;

interface WalletState {
  /** Free USDT (not committed to open positions). */
  balance: number;
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
