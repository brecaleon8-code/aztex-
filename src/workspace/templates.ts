import type { IJsonModel } from 'flexlayout-react';
import { makeWindow, model, split, stack } from './layoutModel';
import type { Scope, WindowState } from './types';

export interface Template {
  id: string;
  name: string;
  scope: Scope;
  hint: string;
  build: () => { dock: IJsonModel; windows: Record<string, WindowState> };
}

const byId = (...ws: WindowState[]) => Object.fromEntries(ws.map((w) => [w.id, w]));

/**
 * Built-in layouts. The Trading layout links Monitor, Chart, Order book and Ticket in one group, so
 * a Monitor click retargets all four (as the terminal always behaved).
 */
export const TEMPLATES: Template[] = [
  {
    id: 'tpl-trading',
    name: 'Trading',
    scope: 'terminal',
    hint: 'Monitor, chart, book, ticket and blotter',
    build: () => {
      const monitor = makeWindow('monitor', 'red');
      const chart = makeWindow('chart', 'red', { tf: '1m' });
      const blotter = makeWindow('blotter');
      const book = makeWindow('orderbook', 'red');
      const ticket = makeWindow('ticket', 'red');
      return {
        dock: model(split(100, stack(21, monitor), split(53, stack(66, chart), stack(34, blotter)), split(26, stack(55, book), stack(45, ticket)))),
        windows: byId(monitor, chart, blotter, book, ticket),
      };
    },
  },
  {
    id: 'tpl-research',
    name: 'Research',
    scope: 'terminal',
    hint: 'Large chart, comparison chart and news',
    build: () => {
      const chart = makeWindow('chart', 'red', { tf: '1h' });
      const comparison = makeWindow('comparison');
      const news = makeWindow('news', 'red');
      const monitor = makeWindow('monitor', 'red');
      return {
        dock: model(split(100, stack(64, chart, monitor), split(36, stack(48, comparison), stack(52, news)))),
        windows: byId(chart, monitor, comparison, news),
      };
    },
  },
  {
    id: 'tpl-execution',
    name: 'Execution',
    scope: 'terminal',
    hint: 'Book, ticket, blotter and a large monitor',
    build: () => {
      const monitor = makeWindow('monitor', 'red');
      const book = makeWindow('orderbook', 'red');
      const tape = makeWindow('tape', 'red');
      const blotter = makeWindow('blotter');
      const ticket = makeWindow('ticket', 'red');
      return {
        dock: model(split(100, split(68, split(60, stack(58, monitor), stack(42, book, tape)), stack(40, blotter)), stack(32, ticket))),
        windows: byId(monitor, book, tape, blotter, ticket),
      };
    },
  },
  {
    id: 'tpl-charts',
    name: 'Charts 2×2',
    scope: 'terminal',
    hint: 'Four unlinked charts, each with its own symbol',
    build: () => {
      const charts = ['BTC', 'ETH', 'SOL', 'XRP'].map((symbol) => makeWindow('chart', null, { tf: '15m', symbol }));
      return {
        dock: model(split(100, split(50, stack(50, charts[0]), stack(50, charts[2])), split(50, stack(50, charts[1]), stack(50, charts[3])))),
        windows: byId(...charts),
      };
    },
  },
  {
    id: 'tpl-discovery',
    name: 'Discovery',
    scope: 'discovery',
    hint: 'Market share, comparison and scanner',
    build: () => {
      const search = makeWindow('search');
      const share = makeWindow('marketShare');
      const comparison = makeWindow('comparison');
      const scanner = makeWindow('scanner');
      return {
        dock: model(split(100, split(58, stack(56, share, search), stack(44, comparison)), stack(42, scanner))),
        windows: byId(search, share, comparison, scanner),
      };
    },
  },
  {
    id: 'tpl-community',
    name: 'Community',
    scope: 'community',
    hint: 'Messages and forum',
    build: () => {
      const messages = makeWindow('messages');
      const forum = makeWindow('forum');
      return { dock: model(split(100, stack(62, messages), stack(38, forum))), windows: byId(messages, forum) };
    },
  },
  {
    id: 'tpl-otc',
    name: 'OTC desk',
    scope: 'otc',
    hint: 'Request for quote, desks and OTC blotter',
    build: () => {
      const otc = makeWindow('otc');
      const blotter = makeWindow('blotter', null, { tab: 'otc' });
      return { dock: model(split(100, stack(64, otc), stack(36, blotter))), windows: byId(otc, blotter) };
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
export const templatesFor = (scope: Scope) => TEMPLATES.filter((t) => t.scope === scope);
/** The layout each scope opens with (and falls back to when a saved read fails). */
export const DEFAULT_TEMPLATE: Record<Scope, string> = {
  terminal: 'tpl-trading',
  discovery: 'tpl-discovery',
  community: 'tpl-community',
  otc: 'tpl-otc',
};
