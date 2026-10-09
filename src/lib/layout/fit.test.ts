import { describe, expect, it } from 'vitest';
import { bottomHeight, fitRows, pack } from './fit';

describe('fit-to-screen terminal layout', () => {
  it('packs panels into lines by minimum width', () => {
    expect(pack(['watchlist', 'chart', 'ticket', 'orderbook'], 1338, 8)).toEqual([['watchlist', 'chart', 'ticket', 'orderbook']]);
    expect(pack(['watchlist', 'chart', 'ticket', 'orderbook'], 1100, 8)).toEqual([['watchlist', 'chart', 'ticket'], ['orderbook']]);
    expect(pack([], 1000, 8)).toEqual([]);
  });

  it('Trade workspace: main row + bottom tier share the visible height exactly', () => {
    const rows = fitRows({ order: ['watchlist', 'chart', 'ticket', 'orderbook', 'positions', 'orders'], width: 1500, height: 600, gap: 8, maximized: false, bottomFrac: 0.3 });
    expect(rows.map((r) => r.ids)).toEqual([
      ['watchlist', 'chart', 'ticket', 'orderbook'],
      ['positions', 'orders'],
    ]);
    expect(rows[0].h + rows[1].h + 8).toBe(600);
    expect(rows[1].h).toBe(180);
    // Short laptop screen: still two tiers, both on screen.
    const short = fitRows({ order: ['watchlist', 'chart', 'ticket', 'orderbook', 'positions', 'orders'], width: 1338, height: 480, gap: 8, maximized: false, bottomFrac: 0.26 });
    expect(short.map((r) => r.h)).toEqual([342, 130]);
  });

  it('keeps the main row usable on short screens', () => {
    expect(bottomHeight(560, 0.6, 8)).toBe(560 - 8 - 320);
    expect(bottomHeight(900, 0.05, 8)).toBe(130);
    // Too short for two tiers → each row gets the full height.
    const rows = fitRows({ order: ['chart', 'positions'], width: 1500, height: 440, gap: 8, maximized: false, bottomFrac: 0.3 });
    expect(rows).toEqual([{ ids: ['chart', 'positions'], h: 440 }]);
  });

  it('maximized chart fills the screen; other panels continue below', () => {
    const rows = fitRows({ order: ['watchlist', 'chart', 'ticket', 'positions'], width: 1500, height: 700, gap: 8, maximized: true, bottomFrac: 0.3 });
    expect(rows[0]).toEqual({ ids: ['chart'], h: 700 });
    expect(rows.slice(1).flatMap((r) => r.ids)).toEqual(['watchlist', 'ticket', 'positions']);
  });

  it('workspaces without bottom panels use full-height rows', () => {
    const rows = fitRows({ order: ['chart', 'orderbook', 'tape', 'flow', 'ticket'], width: 1500, height: 700, gap: 8, maximized: false, bottomFrac: 0.3 });
    expect(rows).toEqual([{ ids: ['chart', 'orderbook', 'tape', 'flow', 'ticket'], h: 700 }]);
  });
});
