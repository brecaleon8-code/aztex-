import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TradeChipData } from '@/types';
import { MOCK_USERS, SEED_POSTS, generateFriendCode } from '@/lib/mock/community';
import { uid } from '@/lib/format';

export interface Message {
  id: string;
  from: 'me' | string; // friend code
  text?: string;
  trade?: TradeChipData;
  time: number;
}

export interface Post {
  id: string;
  author: string;
  handle: string | null;
  text: string;
  trade?: TradeChipData;
  likes: number;
  liked: boolean;
  comments: number;
  time: number;
  mine?: boolean;
}

export const HANDLE_RE = /^@?([A-Za-z0-9_]{1,15})$/;
export function normalizeHandle(raw: string): string | null {
  const m = HANDLE_RE.exec(raw.trim());
  return m ? m[1] : null;
}
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

interface CommunityState {
  handle: string | null;
  friendCode: string;
  contacts: string[];
  active: string | null;
  threads: Record<string, Message[]>;
  posts: Post[];
  linkHandle: (raw: string) => boolean;
  unlinkHandle: () => void;
  addContact: (raw: string) => { ok: true; name: string } | { ok: false; error: string };
  setActive: (code: string) => void;
  send: (code: string, m: Omit<Message, 'id' | 'time' | 'from'>, from?: 'me' | string) => void;
  post: (text: string, trade?: TradeChipData) => void;
  toggleLike: (id: string) => void;
}

const now = Date.now();
const seedThreads: Record<string, Message[]> = {
  'AZT-7K2Q-9XM': [
    { id: 's1', from: 'AZT-7K2Q-9XM', text: 'Morning — you seeing the bid stack under 62k?', time: now - 42 * 60_000 },
    { id: 's2', from: 'me', text: 'Yeah, thick. Waiting for a sweep before I size.', time: now - 39 * 60_000 },
    { id: 's3', from: 'AZT-7K2Q-9XM', text: 'Here is how I am positioned:', trade: { symbol: 'BTC', side: 'Long', entry: 61850, tp: 64200, sl: 61100 }, time: now - 37 * 60_000 },
  ],
  'AZT-3HV8-2PL': [{ id: 's4', from: 'AZT-3HV8-2PL', text: 'ETH/BTC still heavy. Fading bounces.', time: now - 3 * 3600_000 }],
};

export const useCommunityStore = create<CommunityState>()(
  persist(
    (set, get) => ({
      handle: null,
      friendCode: generateFriendCode(),
      contacts: ['AZT-7K2Q-9XM', 'AZT-3HV8-2PL'],
      active: 'AZT-7K2Q-9XM',
      threads: seedThreads,
      posts: SEED_POSTS.map((p, i) => ({ id: `seed${i}`, author: p.author, handle: p.handle, text: p.text, trade: p.trade, likes: p.likes, liked: false, comments: p.comments, time: now - p.minutesAgo * 60_000 })),
      linkHandle: (raw) => {
        const h = normalizeHandle(raw);
        if (!h) return false;
        set({ handle: h });
        return true;
      },
      unlinkHandle: () => set({ handle: null }),
      addContact: (raw) => {
        const code = normalizeCode(raw);
        if (code === get().friendCode) return { ok: false, error: 'That is your own code' };
        if (get().contacts.includes(code)) return { ok: false, error: 'Already in your contacts' };
        const user = MOCK_USERS.find((u) => u.code === code);
        if (!user) return { ok: false, error: 'No trader found for that code' };
        set((s) => ({ contacts: [...s.contacts, code], active: code }));
        return { ok: true, name: user.name };
      },
      setActive: (active) => set({ active }),
      send: (code, m, from = 'me') => set((s) => ({ threads: { ...s.threads, [code]: [...(s.threads[code] ?? []), { ...m, from, id: uid('msg_'), time: Date.now() }] } })),
      post: (text, trade) =>
        set((s) => ({ posts: [{ id: uid('post_'), author: 'You', handle: s.handle, text, trade, likes: 0, liked: false, comments: 0, time: Date.now(), mine: true }, ...s.posts] })),
      toggleLike: (id) => set((s) => ({ posts: s.posts.map((p) => (p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p)) })),
    }),
    { name: 'aztex.community' },
  ),
);

export function userByCode(code: string) {
  return MOCK_USERS.find((u) => u.code === code);
}
