import { useEffect, useRef, useState } from 'react';
import type { Candle, IndicatorInstance } from '@/types';
import type { ScriptRun } from '@/lib/indicators/compute';
import { runScript } from './sandbox';

const MIN_INTERVAL_MS = 1000;

/**
 * Keeps sandbox results fresh for every script indicator on the chart. Runs immediately when a
 * script, its inputs or the symbol change; otherwise at most once a second per indicator as live
 * candles stream in. Never overlaps runs of the same indicator.
 */
export function useScriptRuns(indicators: IndicatorInstance[], candles: Candle[]): Record<string, ScriptRun> {
  const [runs, setRuns] = useState<Record<string, ScriptRun>>({});
  const [tick, setTick] = useState(0);
  const last = useRef<Record<string, { key: string; at: number }>>({});
  const inflight = useRef(new Set<string>());
  const latest = useRef(candles);
  latest.current = candles;

  useEffect(() => {
    const scripts = indicators.filter((i) => i.kind === 'script' && i.script);
    let wait = Infinity;
    for (const i of scripts) {
      if (inflight.current.has(i.id) || candles.length === 0) continue;
      const key = `${i.script}\u0000${JSON.stringify(i.inputs ?? {})}\u0000${candles[0].time}`;
      const prev = last.current[i.id];
      const since = Date.now() - (prev?.at ?? 0);
      if (prev && prev.key === key && since < MIN_INTERVAL_MS) {
        wait = Math.min(wait, MIN_INTERVAL_MS - since);
        continue;
      }
      last.current[i.id] = { key, at: Date.now() };
      inflight.current.add(i.id);
      const snapshot = candles;
      runScript(i.script!, snapshot, i.inputs ?? {}).then((result) => {
        inflight.current.delete(i.id);
        setRuns((s) => ({ ...s, [i.id]: { result, t0: snapshot[0].time } }));
        if (latest.current !== snapshot) setTick((t) => t + 1);
      });
    }
    const timer = Number.isFinite(wait) ? setTimeout(() => setTick((t) => t + 1), wait) : undefined;
    return () => clearTimeout(timer);
  }, [indicators, candles, tick]);

  return runs;
}
