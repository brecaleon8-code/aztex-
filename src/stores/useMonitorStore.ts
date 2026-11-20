import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '@/lib/format';

/**
 * Extra named symbol lists for the Monitor. The main list is the market store's watchlist (shared
 * with the phone app's Quotes); these sit beside it as tabs.
 */
export interface SymbolList {
  id: string;
  name: string;
  symbols: string[];
}
export const MAIN_LIST = 'main';

interface MonitorState {
  lists: SymbolList[];
  createList: (name: string, symbols?: string[]) => string;
  renameList: (id: string, name: string) => void;
  deleteList: (id: string) => void;
  add: (id: string, symbol: string) => void;
  remove: (id: string, symbol: string) => void;
}

export const useMonitorStore = create<MonitorState>()(
  persist(
    (set) => ({
      lists: [{ id: 'majors', name: 'Majors', symbols: ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'LINK'] }],
      createList: (name, symbols = []) => {
        const id = uid('list_');
        set((s) => ({ lists: [...s.lists, { id, name: name.trim() || 'List', symbols }] }));
        return id;
      },
      renameList: (id, name) => set((s) => ({ lists: s.lists.map((l) => (l.id === id && name.trim() ? { ...l, name: name.trim() } : l)) })),
      deleteList: (id) => set((s) => ({ lists: s.lists.filter((l) => l.id !== id) })),
      add: (id, symbol) => set((s) => ({ lists: s.lists.map((l) => (l.id === id && !l.symbols.includes(symbol) ? { ...l, symbols: [...l.symbols, symbol] } : l)) })),
      remove: (id, symbol) => set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, symbols: l.symbols.filter((x) => x !== symbol) } : l)) })),
    }),
    { name: 'aztex.monitor', version: 1 },
  ),
);
