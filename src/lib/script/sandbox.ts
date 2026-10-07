import type { Candle } from '@/types';
import { DEFAULT_LIMITS, precheck, toCandles, type ScriptResult } from './engine';

/**
 * Main-thread client for the script worker. One worker is reused across runs (loading the WASM
 * engine is the expensive part); requests are serialised. If the worker fails to answer within the
 * VM time limit plus a grace period it is terminated and replaced — a hard backstop on top of the
 * QuickJS interrupt handler.
 */

const GRACE_MS = 2500;
let worker: Worker | null = null;
let seq = 0;
let chain: Promise<unknown> = Promise.resolve();

function spawn(): Worker {
  return new Worker(new URL('./script.worker.ts', import.meta.url), { type: 'module', name: 'aztex-script-sandbox' });
}

function kill() {
  worker?.terminate();
  worker = null;
}

function exec(code: string, candles: Candle[], inputs: Record<string, number>, timeMs: number): Promise<ScriptResult> {
  const bad = precheck(code);
  if (bad) return Promise.resolve({ ok: false, error: bad, logs: [], ms: 0 });
  if (typeof Worker === 'undefined') return Promise.resolve({ ok: false, error: 'Scripts need Web Worker support', logs: [], ms: 0 });
  const w = (worker ??= spawn());
  const id = ++seq;
  return new Promise<ScriptResult>((resolve) => {
    const done = (r: ScriptResult) => {
      clearTimeout(timer);
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onErr);
      resolve(r);
    };
    const onMsg = (e: MessageEvent<{ id: number; result: ScriptResult }>) => e.data?.id === id && done(e.data.result);
    const onErr = (e: ErrorEvent) => {
      kill();
      done({ ok: false, error: `Sandbox crashed: ${e.message || 'unknown error'}`, logs: [], ms: 0 });
    };
    const timer = setTimeout(() => {
      kill();
      done({ ok: false, error: `Script exceeded the ${(timeMs / 1000).toFixed(1)}s time limit and was terminated`, logs: [], ms: timeMs });
    }, timeMs + GRACE_MS);
    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr);
    w.postMessage({ id, code, data: toCandles(candles), inputs, timeMs });
  });
}

/** Run a script over the candle history. Never rejects; failures come back as `{ ok: false }`. */
export function runScript(code: string, candles: Candle[], inputs: Record<string, number> = {}, timeMs = DEFAULT_LIMITS.timeMs): Promise<ScriptResult> {
  const p = chain.then(() => exec(code, candles, inputs, timeMs));
  chain = p.catch(() => undefined);
  return p;
}
