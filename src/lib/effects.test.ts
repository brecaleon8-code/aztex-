import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard: an effect written as `useEffect(() => expr, …)` returns whatever `expr` returns. If that's
 * ever a non-function (e.g. a Promise — newer browsers return one from scrollIntoView), React throws
 * "destroy is not a function" on cleanup. Effects must use a block body, unless they deliberately
 * return a cleanup function (the app-level `start*()` feeds).
 */
describe('React effects', () => {
  it('use a block body (or return a known cleanup function)', () => {
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !f.includes('.test.')) {
          readFileSync(p, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              const m = /useEffect\(\(\) => (?!\{)(.*)/.exec(line);
              if (m && !/^(start\w+\(\)|\(\) =>)/.test(m[1])) bad.push(`${p}:${i + 1}: ${line.trim()}`);
            });
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(bad).toEqual([]);
  });
});
