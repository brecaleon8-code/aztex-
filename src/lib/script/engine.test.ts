import { beforeAll, describe, expect, it } from 'vitest';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-singlefile-mjs-release-sync';
import { DEFAULT_LIMITS, executeScript, precheck, type ScriptCandles } from './engine';
import { SCRIPT_TEMPLATES } from './templates';
import { sma } from '@/lib/indicators/series';

let qjs: QuickJSWASMModule;
beforeAll(async () => {
  qjs = await newQuickJSWASMModuleFromVariant(variant);
});

const N = 120;
const close = Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 6) * 5 + i * 0.1);
const data: ScriptCandles = {
  open: close.map((c) => c - 0.2),
  high: close.map((c) => c + 1),
  low: close.map((c) => c - 1),
  close,
  volume: close.map(() => 10),
  time: close.map((_, i) => i * 60_000),
};
const run = (code: string, inputs: Record<string, number> = {}, limits = DEFAULT_LIMITS) => executeScript(qjs, code, data, inputs, limits);

describe('script engine (QuickJS sandbox)', () => {
  it('plots a series with one value per candle, matching the host implementation', () => {
    const r = run('plot(ta.sma(close, 20), { title: "SMA", color: "#ff0000" })');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plots).toHaveLength(1);
    expect(r.plots[0]).toMatchObject({ title: 'SMA', color: '#ff0000', style: 'line' });
    expect(r.plots[0].values).toHaveLength(N);
    const ref = sma(close, 20);
    for (let i = 0; i < N; i++) {
      if (ref[i] == null) expect(r.plots[0].values[i]).toBeNull();
      else expect(r.plots[0].values[i]).toBeCloseTo(ref[i]!, 9);
    }
  });

  it('supports per-candle functions, zip, hlines, logs and NaN → null', () => {
    const r = run(`
      const mid = each((i) => (high[i] + low[i]) / 2);
      const diff = zip((a, b) => a - b, close, mid);
      plot(diff, { style: 'histogram' });
      plot(each(() => NaN));
      hline(0, { title: 'zero' });
      console.log('bars', n, [1,2,3]);
    `);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plots[0].style).toBe('histogram');
    expect(r.plots[0].values[5]).toBeCloseTo(close[5] - close[5], 9);
    expect(r.plots[1].values.every((v) => v === null)).toBe(true);
    expect(r.hlines).toEqual([{ value: 0, title: 'zero' }]);
    expect(r.logs).toEqual(['bars 120 [1,2,3]']);
  });

  it('declares inputs, applies overrides and clamps to min/max', () => {
    const code = 'const len = input("Length", 20, { min: 2, max: 50 }); plot(ta.ema(close, len)); log(len)';
    const a = run(code);
    const b = run(code, { Length: 10 });
    const c = run(code, { Length: 999 });
    expect(a.ok && a.inputs[0]).toMatchObject({ name: 'Length', def: 20, min: 2, max: 50, value: 20 });
    expect(b.ok && b.logs).toEqual(['10']);
    expect(c.ok && c.logs).toEqual(['50']);
  });

  it('has no network, DOM, timers or host access', () => {
    const r = run(`
      log(typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof window, typeof document, typeof setTimeout, typeof importScripts, typeof postMessage, typeof self, typeof eval, typeof require, typeof process);
      plot(close);
    `);
    expect(r.ok && r.logs[0]).toBe(Array(12).fill('undefined').join(' '));
  });

  it('cannot tamper with the API or input data', () => {
    const r = run(`'use strict'; try { close[0] = 0 } catch (e) { log('frozen') } try { plot = null } catch (e) { log('locked') } plot(close)`);
    expect(r.ok && r.logs).toEqual(['frozen', 'locked']);
    expect(r.ok && r.plots[0].values[0]).toBe(close[0]);
  });

  it('stops infinite loops at the time limit', () => {
    const r = run('while (true) {}', {}, { ...DEFAULT_LIMITS, timeMs: 150 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Time limit/);
  });

  it('stops runaway allocation at the memory limit', () => {
    const r = run('const a = []; while (true) a.push({ x: 1, y: [1, 2, 3] });', {}, { ...DEFAULT_LIMITS, memoryBytes: 8 * 1024 * 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Memory limit/);
  });

  it('stops runaway recursion', () => {
    const r = run('function f() { return f() + 1 } f()');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Stack|range|recursion/i);
  });

  it('reports errors with the line number in the user script', () => {
    const r = run('const a = 1;\nconst b = 2;\nplot(nope(close));');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/nope/);
      expect(r.line).toBe(3);
    }
  });

  it('validates plot lengths and requires output', () => {
    const r = run('plot([1, 2, 3])');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/expected 120/);
    const e = run('const x = 1');
    expect(!e.ok && e.error).toMatch(/Nothing to draw/);
  });

  it('rejects import/export and oversized code before running', () => {
    expect(precheck('import("http://evil")')).toMatch(/import/);
    expect(precheck('import x from "y"')).toMatch(/import/);
    expect(precheck('x'.repeat(DEFAULT_LIMITS.maxCodeChars + 1))).toMatch(/too long/);
    expect(precheck('const important = 1')).toBeNull();
  });

  it('every built-in template runs cleanly', () => {
    for (const t of SCRIPT_TEMPLATES) {
      const r = run(t.code);
      expect(r.ok, `${t.name}: ${!r.ok ? r.error : ''}`).toBe(true);
    }
  });
});

describe('main-page code never evaluates strings', () => {
  it('has no eval / new Function / Function( outside the sandbox', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts') && !p.includes(join('lib', 'script', 'prelude.ts'))) {
          const src = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
          if (/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(\s*['"`]/.test(src)) offenders.push(p);
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});
