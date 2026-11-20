import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard: Windows and (by default) macOS ignore letter case in file names. Two modules in one folder
 * whose names differ only by case — `MonitorGroups.tsx` beside `monitorGroups.ts` — are distinct on
 * Linux but collide there: an extensionless import (`./MonitorGroups`) can load the wrong one, and
 * the app breaks only on those machines.
 */
describe('source file names', () => {
  it('never differ only by letter case within a folder', () => {
    const clashes: string[] = [];
    const walk = (d: string) => {
      const seen = new Map<string, string>();
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx|mts|mjs)$/.test(f)) continue;
        const key = f.replace(/\.(ts|tsx|js|jsx|mts|mjs)$/, '').toLowerCase();
        const other = seen.get(key);
        if (other) clashes.push(`${join(d, other)} <-> ${p}`);
        else seen.set(key, f);
      }
    };
    walk('src');
    walk('e2e');
    expect(clashes).toEqual([]);
  });
});
