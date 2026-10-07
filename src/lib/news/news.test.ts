import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCalendar, generateStory, MockNewsProvider, releaseStory } from './mockNews';
import { fmtEventValue, surprise, type EconEvent, type NewsStory } from './types';
import { NEWS_CATEGORIES, unreadCount, useNewsStore } from '@/stores/useNewsStore';

const NOW = Date.UTC(2026, 9, 7, 11, 38, 0); // a Wednesday

describe('economic calendar', () => {
  it('covers yesterday → +6 days, sorted, stable for the same day', () => {
    const a = buildCalendar(NOW);
    const b = buildCalendar(NOW + 60_000);
    expect(a.length).toBeGreaterThan(10);
    expect(a.every((e, i) => i === 0 || a[i - 1].time <= e.time)).toBe(true);
    expect(a[0].time).toBeGreaterThanOrEqual(NOW - 2 * 86_400_000);
    expect(a.at(-1)!.time).toBeLessThan(NOW + 7 * 86_400_000);
    const strip = (xs: EconEvent[]) => xs.filter((e) => !e.id.startsWith('ev_soon')).map((e) => e.id + e.title);
    expect(strip(a)).toEqual(strip(b));
  });

  it('past macro events have actuals; upcoming ones do not', () => {
    const cal = buildCalendar(NOW);
    for (const e of cal.filter((x) => x.kind === 'macro')) {
      if (e.time < NOW) expect(e.actual).toBeTypeOf('number');
      else expect(e.actual).toBeUndefined();
    }
  });

  it('schedules a high-impact demo release a few minutes ahead and never repeats one-off releases', () => {
    const cal = buildCalendar(NOW);
    const soon = cal.find((e) => e.id.startsWith('ev_soon'))!;
    expect(soon.impact).toBe(3);
    expect(soon.time - NOW).toBeGreaterThanOrEqual(3 * 60_000);
    expect(soon.time - NOW).toBeLessThanOrEqual(8 * 60_000);
    const titles = cal.filter((e) => e.kind === 'macro' && !/Claims|Inventories/.test(e.title)).map((e) => `${e.region} ${e.title}`);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('scores surprises against forecast, respecting lower-is-better series', () => {
    const base: EconEvent = { id: 'x', time: 0, region: 'US', title: 'CPI', impact: 3, kind: 'macro', unit: '%', decimals: 1, forecast: 3.0, previous: 3.1, higherIsBetter: false };
    expect(surprise({ ...base, actual: 3.2 })).toBe(-1);
    expect(surprise({ ...base, actual: 2.8 })).toBe(1);
    expect(surprise({ ...base, actual: 3.0 })).toBe(0);
    expect(surprise({ ...base, higherIsBetter: true, actual: 3.2 })).toBe(1);
    expect(surprise(base)).toBe(0);
    expect(fmtEventValue(base, 3)).toBe('3.0%');
    expect(fmtEventValue({ ...base, unit: 'K', decimals: 0 }, 180)).toBe('180K');
    expect(releaseStory({ ...base, actual: 3.2 }).headline).toBe('US CPI: 3.2% vs 3.0% expected — worse than expected');
  });
});

describe('headline wire', () => {
  it('generates tagged stories with valid fields', () => {
    for (let i = 0; i < 200; i++) {
      const s = generateStory(['BTC', 'ETH']);
      expect(NEWS_CATEGORIES.map((c) => c.id)).toContain(s.category);
      expect([1, 2, 3]).toContain(s.impact);
      expect(s.headline.length).toBeGreaterThan(10);
      for (const x of s.symbols) expect(['BTC', 'ETH']).toContain(x);
    }
  });

  describe('provider', () => {
    afterEach(() => vi.useRealTimers());
    it('streams a backlog, new stories, and releases events when due', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const stories: NewsStory[] = [];
      const updates: EconEvent[] = [];
      let cal: EconEvent[] = [];
      const stop = new MockNewsProvider(['BTC']).start({ onStories: (s) => stories.push(...s), onCalendar: (e) => (cal = e), onEventUpdate: (e) => updates.push(e) });
      const backlog = stories.length;
      expect(backlog).toBeGreaterThan(20);
      const soon = cal.find((e) => e.id.startsWith('ev_soon'))!;
      vi.advanceTimersByTime(soon.time - NOW + 1500);
      expect(stories.length).toBeGreaterThan(backlog + 3);
      const rel = updates.find((e) => e.id === soon.id)!;
      expect(rel.actual).toBeTypeOf('number');
      expect(stories.some((s) => s.eventId === soon.id && s.impact === 3)).toBe(true);
      stop();
      const n = stories.length;
      vi.advanceTimersByTime(120_000);
      expect(stories.length).toBe(n);
    });
  });
});

describe('news store', () => {
  it('dedupes and orders stories, counts unread', () => {
    const mk = (id: string, time: number): NewsStory => ({ id, time, source: 'Wire', category: 'crypto', symbols: [], headline: id, impact: 1, sentiment: 0 });
    useNewsStore.setState({ stories: [] });
    useNewsStore.getState().addStories([mk('a', 1), mk('b', 3)]);
    useNewsStore.getState().addStories([mk('b', 3), mk('c', 2)]);
    expect(useNewsStore.getState().stories.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(unreadCount(useNewsStore.getState().stories, 1.5)).toBe(2);
  });

  it('category chips isolate from "all", toggle, and never end empty', () => {
    const st = useNewsStore.getState;
    st().setAllCategories();
    st().toggleCategory('macro');
    expect(st().categories).toEqual(['macro']);
    st().toggleCategory('crypto');
    expect(st().categories).toEqual(['macro', 'crypto']);
    st().toggleCategory('macro');
    st().toggleCategory('crypto');
    expect(st().categories).toHaveLength(NEWS_CATEGORIES.length);
  });

  it('dock toggles open/closed, clamps width, and only persists preferences', () => {
    const st = useNewsStore.getState;
    st().setPinned(false);
    st().toggleDock();
    expect(st().pinned).toBe(true);
    st().toggleDock();
    expect(st().pinned).toBe(false);
    st().setWidth(10_000);
    expect(st().width).toBe(560);
    st().setWidth(1);
    expect(st().width).toBe(280);
    const saved = JSON.parse(localStorage.getItem('aztex.news') ?? '{}').state;
    expect(saved).toBeDefined();
    expect(saved.stories).toBeUndefined();
    expect(saved.events).toBeUndefined();
    expect(saved.width).toBe(280);
  });
});
