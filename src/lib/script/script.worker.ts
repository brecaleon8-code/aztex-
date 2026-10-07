/// <reference lib="webworker" />
/**
 * Dedicated worker that hosts the QuickJS (WASM) engine. User code is evaluated only inside the VM;
 * this worker just shuttles plain JSON in and out. The host terminates the worker if it stops
 * answering, so even a VM bug can't hang the page.
 */
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-singlefile-mjs-release-sync';
import { executeScript, DEFAULT_LIMITS, type ScriptCandles } from './engine';

interface RunMsg {
  id: number;
  code: string;
  data: ScriptCandles;
  inputs: Record<string, number>;
  timeMs?: number;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
const send = scope.postMessage.bind(scope);

// Defence in depth: the VM can't reach these anyway, but strip network/storage entry points from the
// worker global too so nothing in this realm can phone home.
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'Worker', 'SharedWorker']) {
  try {
    Object.defineProperty(scope, k, { value: undefined, configurable: false, writable: false });
  } catch {
    /* non-configurable in this browser — ignore */
  }
}

let mod: Promise<QuickJSWASMModule> | null = null;

scope.onmessage = async (e: MessageEvent<RunMsg>) => {
  const m = e.data;
  if (!m || typeof m.id !== 'number' || typeof m.code !== 'string' || !m.data || !Array.isArray(m.data.close)) return;
  try {
    mod ??= newQuickJSWASMModuleFromVariant(variant);
    const qjs = await mod;
    const limits = { ...DEFAULT_LIMITS, timeMs: Math.min(Math.max(m.timeMs ?? DEFAULT_LIMITS.timeMs, 50), 5000) };
    send({ id: m.id, result: executeScript(qjs, m.code, m.data, m.inputs ?? {}, limits) });
  } catch (err) {
    mod = null; // the WASM instance may be in an undefined state — start fresh next run
    send({ id: m.id, result: { ok: false, error: `Sandbox error: ${err instanceof Error ? err.message : String(err)}`, logs: [], ms: 0 } });
  }
};
