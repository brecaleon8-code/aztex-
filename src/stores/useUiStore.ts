import { create } from 'zustand';

/** Transient, app-level UI state (modals). Not persisted. */
interface UiState {
  deposit: { open: boolean; asset?: string };
  openDeposit: (asset?: string) => void;
  closeDeposit: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  deposit: { open: false },
  openDeposit: (asset) => set({ deposit: { open: true, asset } }),
  closeDeposit: () => set({ deposit: { open: false } }),
}));
