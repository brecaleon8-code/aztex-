import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { PRELUDE } from './prelude';

/**
 * Script execution engine. User JavaScript runs inside QuickJS compiled to WebAssembly: a separate
 * JS engine with its own heap, no DOM, no network, no timers, no host objects. Each run gets a fresh
 * runtime with a hard memory cap, a stack cap and a CPU-time interrupt, and is torn down afterwards.
 * The host page never evaluates user code — no `eval` / `new Function` anywhere outside the VM.
 *
 * In the app this runs inside a dedicated Web Worker (see script.worker.ts), so even a pathological
 * script cannot block the UI; the worker itself is terminated if it ever stops responding.
 */

export interface ScriptLimits {
  timeMs: number;
  memoryBytes: number;
  stackBytes: number;
  maxCodeChars: number;
  plots: number;
  hlines: number;
  inputs: number;
  logs: number;
}

export const DEFAULT_LIMITS: ScriptLimits = {
  timeMs: 1000,
  memoryBytes: 32 * 1024 * 1024,
  stackBytes: 192 * 1024,
  maxCodeChars: 20_000,
  plots: 8,
  hlines: 8,
  inputs: 12,
  logs: 50,
};

export interface ScriptCandles {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  time: number[];
}

export interface ScriptPlot {
  title: string;
  color: string | null;
  style: 'line' | 'histogram' | 'dashed';
  values: (number | null)[];
}
export interface ScriptInput {
  name: string;
  def: number;
  min: number | null;
  max: number | null;
  step: number | null;
  value: number;
}
export interface ScriptOk {
  ok: true;
  plots: ScriptPlot[];
  hlines: { value: number; title: string }[];
  inputs: ScriptInput[];
  logs: string[];
  ms: number;
}
export interface ScriptErr {
  ok: false;
  error: string;
  line?: number;
  logs: string[];
  ms: number;
}
export type ScriptResult = ScriptOk | ScriptErr;

/** Static checks before anything is handed to the VM. */
export function precheck(code: string, limits: ScriptLimits = DEFAULT_LIMITS): string | null {
  if (code.length > limits.maxCodeChars) return `Script is too long (${code.length.toLocaleString()} / ${limits.maxCodeChars.toLocaleString()} characters)`;
  if (!code.trim()) return 'Script is empty';
  // Module loading is meaningless in the sandbox; reject it up front with a clear message.
  if (/\bimport\s*[(.{*]|\bimport\s+[\w$]|\bexport\s/.test(code)) return 'import/export are not available in scripts';
  return null;
}

const LINE_RE = /script\.js:(\d+)/;

function friendly(name: string, message: string): string {
  if (message === 'interrupted') return 'Time limit exceeded — script was stopped';
  if (message === 'out of memory') return 'Memory limit exceeded — script was stopped';
  if (/stack overflow/i.test(message)) return 'Stack limit exceeded (runaway recursion?)';
  return `${name || 'Error'}: ${message}`;
}

export function toCandles(c: { open: number; high: number; low: number; close: number; volume: number; time: number }[]): ScriptCandles {
  return {
    open: c.map((x) => x.open),
    high: c.map((x) => x.high),
    low: c.map((x) => x.low),
    close: c.map((x) => x.close),
    volume: c.map((x) => x.volume),
    time: c.map((x) => x.time),
  };
}

export function executeScript(qjs: QuickJSWASMModule, code: string, data: ScriptCandles, overrides: Record<string, number> = {}, limits: ScriptLimits = DEFAULT_LIMITS, now: () => number = () => performance.now()): ScriptResult {
  const t0 = now();
  const bad = precheck(code, limits);
  if (bad) return { ok: false, error: bad, logs: [], ms: 0 };

  const rt = qjs.newRuntime();
  rt.setMemoryLimit(limits.memoryBytes);
  rt.setMaxStackSize(limits.stackBytes);
  const deadline = t0 + limits.timeMs;
  rt.setInterruptHandler(() => now() > deadline);
  const ctx = rt.newContext();
  let logs: string[] = [];
  try {
    const n = data.close.length;
    const payload = JSON.stringify({ ...data, limits: { plots: limits.plots, hlines: limits.hlines, inputs: limits.inputs, logs: limits.logs }, n });
    const setGlobal = (k: string, v: string) => {
      const h = ctx.newString(v);
      ctx.setProp(ctx.global, k, h);
      h.dispose();
    };
    setGlobal('__AZ_DATA', payload);
    setGlobal('__AZ_INPUTS', JSON.stringify(overrides ?? {}));

    const run = (src: string, file: string): { ok: true; value: unknown } | { ok: false; error: string; line?: number } => {
      const r = ctx.evalCode(src, file);
      if (r.error) {
        const e = ctx.dump(r.error) as { name?: string; message?: string; stack?: string } | string;
        r.error.dispose();
        if (typeof e === 'string' || e == null) return { ok: false, error: `Uncaught ${String(e)}` };
        const m = LINE_RE.exec(e.stack ?? '');
        return { ok: false, error: friendly(e.name ?? 'Error', String(e.message ?? e)), line: m ? +m[1] : undefined };
      }
      const value = ctx.dump(r.value);
      r.value.dispose();
      return { ok: true, value };
    };

    const pre = run(PRELUDE, 'prelude.js');
    if (!pre.ok) return { ok: false, error: `Sandbox failed to start: ${pre.error}`, logs, ms: now() - t0 };

    const user = run(code, 'script.js');
    // Collect logs/plots even if the script threw, so console output helps debugging.
    const collected = run('__AZ_RESULT()', 'collect.js');
    const out = collected.ok && typeof collected.value === 'string' ? (JSON.parse(collected.value) as Omit<ScriptOk, 'ok' | 'ms'>) : null;
    logs = out?.logs ?? [];
    if (!user.ok) return { ok: false, error: user.error, line: user.line, logs, ms: now() - t0 };
    if (!out) return { ok: false, error: collected.ok ? 'Sandbox returned no result' : collected.error, logs, ms: now() - t0 };
    if (out.plots.length === 0 && out.hlines.length === 0) return { ok: false, error: 'Nothing to draw — call plot(series) at least once', logs, ms: now() - t0 };
    return { ok: true, ...sanitize(out, n), ms: now() - t0 };
  } finally {
    // A host-level failure (thrown out of the WASM module) propagates to the caller, which must
    // discard the module instance; disposal errors are swallowed for the same reason.
    try {
      ctx.dispose();
      rt.dispose();
    } catch {
      /* module is unusable; caller resets it */
    }
  }
}

/** Never trust what comes out of the VM: re-validate shape, lengths and types. */
function sanitize(out: Omit<ScriptOk, 'ok' | 'ms'>, n: number): Omit<ScriptOk, 'ok' | 'ms'> {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '');
  return {
    plots: (Array.isArray(out.plots) ? out.plots : []).slice(0, DEFAULT_LIMITS.plots).map((p) => ({
      title: str(p.title) || 'Plot',
      color: typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : null,
      style: p.style === 'histogram' || p.style === 'dashed' ? p.style : 'line',
      values: Array.from({ length: n }, (_, i) => num(Array.isArray(p.values) ? p.values[i] : null)),
    })),
    hlines: (Array.isArray(out.hlines) ? out.hlines : []).slice(0, DEFAULT_LIMITS.hlines).flatMap((h) => (num(h.value) == null ? [] : [{ value: num(h.value)!, title: str(h.title) }])),
    inputs: (Array.isArray(out.inputs) ? out.inputs : []).slice(0, DEFAULT_LIMITS.inputs).flatMap((x) =>
      num(x.value) == null ? [] : [{ name: str(x.name), def: num(x.def) ?? 0, min: num(x.min), max: num(x.max), step: num(x.step), value: num(x.value)! }],
    ),
    logs: (Array.isArray(out.logs) ? out.logs : []).slice(0, DEFAULT_LIMITS.logs).map((l) => str(l, 300)),
  };
}
