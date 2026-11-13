import { lazy, type ComponentType } from 'react';
import {
  BookOpenText,
  CandlestickChart,
  ChartPie,
  Gauge,
  Handshake,
  LineChart,
  ListOrdered,
  MessagesSquare,
  Newspaper,
  Radar,
  ReceiptText,
  Search,
  SquarePen,
  Rows3,
  Activity,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { WINDOW_TITLES, LINKABLE } from './layoutModel';
import type { Scope, WindowType } from './types';

const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));

// Terminal windows ship with the terminal; the others load on demand.
const terminal = () => import('@/modules/terminal/windows');
const discovery = () => import('@/modules/discovery/windows');
const community = () => import('@/modules/community/windows');
const otc = () => import('@/modules/otc/windows');
const news = () => import('@/modules/news/NewsWindow');

export interface WindowDef {
  type: WindowType;
  title: string;
  icon: LucideIcon;
  /** Takes part in link groups (shows a symbol). */
  linkable: boolean;
  /** Where the "Add window" menu lists it. */
  group: 'Trading' | 'Market data' | 'Research' | 'Social';
  component: ComponentType;
  /** Settings a new window starts with (merged under what the caller passes). */
  defaults?: Record<string, unknown>;
}

const def = (type: WindowType, icon: LucideIcon, group: WindowDef['group'], component: ComponentType, defaults?: Record<string, unknown>): WindowDef => ({
  type,
  title: WINDOW_TITLES[type],
  icon,
  linkable: LINKABLE.has(type),
  group,
  component,
  defaults,
});

export const REGISTRY: Record<WindowType, WindowDef> = {
  monitor: def('monitor', Rows3, 'Market data', named(terminal, 'MonitorWindow')),
  chart: def('chart', CandlestickChart, 'Market data', named(terminal, 'ChartWindow')),
  orderbook: def('orderbook', BookOpenText, 'Market data', named(terminal, 'OrderBookWindow')),
  tape: def('tape', ListOrdered, 'Market data', named(terminal, 'TapeWindow')),
  flow: def('flow', Waves, 'Market data', named(terminal, 'FlowWindow')),
  ticket: def('ticket', SquarePen, 'Trading', named(terminal, 'TicketWindow')),
  blotter: def('blotter', ReceiptText, 'Trading', named(terminal, 'BlotterWindow')),
  pnl: def('pnl', Activity, 'Trading', named(terminal, 'PnlWindow')),
  otc: def('otc', Handshake, 'Trading', named(otc, 'OtcWindow')),
  news: def('news', Newspaper, 'Research', named(news, 'NewsWindow')),
  comparison: def('comparison', LineChart, 'Research', named(discovery, 'ComparisonWindow')),
  marketShare: def('marketShare', ChartPie, 'Research', named(discovery, 'MarketShareWindow')),
  scanner: def('scanner', Radar, 'Research', named(discovery, 'ScannerWindow')),
  search: def('search', Search, 'Research', named(discovery, 'SearchWindow')),
  messages: def('messages', MessagesSquare, 'Social', named(community, 'MessagesWindow')),
  forum: def('forum', Gauge, 'Social', named(community, 'ForumWindow')),
};

/** Windows offered in the Add window menu per route (any window can be docked anywhere). */
export const WINDOW_GROUPS: WindowDef['group'][] = ['Market data', 'Trading', 'Research', 'Social'];
export const SCOPE_LABEL: Record<Scope, string> = { terminal: 'Terminal', discovery: 'Data & Discovery', community: 'Community', otc: 'OTC Desk' };
