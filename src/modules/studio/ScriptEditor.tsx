import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Play, ShieldCheck, Terminal, AlertTriangle, LoaderCircle } from 'lucide-react';
import type { Candle } from '@/types';
import { runScript } from '@/lib/script/sandbox';
import { DEFAULT_LIMITS, type ScriptResult } from '@/lib/script/engine';
import { fmtPrice } from '@/lib/format';

const PALETTE = ['#7FA7CF', '#B39CDB', '#D2AE72', '#DDA1BC', '#93A8BF', '#CFD3D8'];
export const plotColor = (r: ScriptResult | null, k: number, base: string) => (r?.ok && r.plots[k]?.color) || (k === 0 ? base : PALETTE[(k - 1) % PALETTE.length]);

/** Debounced sandbox run for the editor preview. Re-runs on code/input edits, not on every tick. */
export function useScriptPreview(code: string, inputs: Record<string, number>, candles: Candle[], symbolKey: string) {
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [running, setRunning] = useState(false);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(candles);
  latest.current = candles;
  const inputsKey = JSON.stringify(inputs);
  const ready = candles.length > 0;

  useEffect(() => {
    if (!ready || !code.trim()) return setResult(null);
    let live = true;
    const t = setTimeout(() => {
      setRunning(true);
      runScript(code, latest.current, JSON.parse(inputsKey)).then((r) => {
        if (!live) return;
        setResult(r);
        setRunning(false);
      });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [code, inputsKey, symbolKey, ready, nonce]);

  return { result, running, rerun: () => setNonce((n) => n + 1) };
}

/** Plain-textarea code editor with a line gutter, soft tabs and an error-line marker. */
export function CodeEditor({ value, onChange, errorLine, testId }: { value: string; onChange: (v: string) => void; errorLine?: number; testId?: string }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split('\n').length;

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = el;
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', a - 1) + 1;
      if (e.shiftKey) {
        const strip = value.slice(lineStart, lineStart + 2).match(/^ {1,2}/)?.[0].length ?? 0;
        if (!strip) return;
        onChange(value.slice(0, lineStart) + value.slice(lineStart + strip));
        requestAnimationFrame(() => el.setSelectionRange(Math.max(lineStart, a - strip), Math.max(lineStart, b - strip)));
      } else {
        onChange(value.slice(0, a) + '  ' + value.slice(b));
        requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
      }
    } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      // Keep the current line's indentation (+2 after an opening brace).
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', a - 1) + 1;
      const indent = value.slice(lineStart).match(/^ */)![0].length;
      const extra = /[{([]\s*$/.test(value.slice(lineStart, a)) ? 2 : 0;
      const ins = '\n' + ' '.repeat(indent + extra);
      onChange(value.slice(0, a) + ins + value.slice(b));
      requestAnimationFrame(() => el.setSelectionRange(a + ins.length, a + ins.length));
    }
  };

  return (
    <div className="code-editor">
      <div className="code-gutter mono" ref={gutter} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errorLine === i + 1 ? 'err' : undefined}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={ta}
        className="code-area mono"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
        aria-label="Script source"
        data-testid={testId}
      />
    </div>
  );
}

export function ScriptStatus({ result, running, onRun }: { result: ScriptResult | null; running: boolean; onRun: () => void }) {
  return (
    <div className="script-status">
      <button className="btn sm" onClick={onRun} data-testid="script-run">
        {running ? <LoaderCircle size={12} className="spin" /> : <Play size={12} />} Run
      </button>
      {result?.ok && (
        <span className="ok-text" data-testid="script-ok">
          {result.plots.length} plot{result.plots.length === 1 ? '' : 's'}
          {result.hlines.length ? ` · ${result.hlines.length} level${result.hlines.length === 1 ? '' : 's'}` : ''} · {result.ms.toFixed(0)} ms
        </span>
      )}
      {result && !result.ok && (
        <span className="error-text" data-testid="script-error">
          <AlertTriangle size={12} /> {result.error}
          {result.line ? <span className="mono"> · line {result.line}</span> : null}
        </span>
      )}
      <span className="spacer" />
      <span className="faint sandbox-badge" title={`QuickJS (WebAssembly) in a Web Worker · no network, DOM or storage · ${DEFAULT_LIMITS.timeMs / 1000}s CPU · ${DEFAULT_LIMITS.memoryBytes / 1024 / 1024} MB heap`}>
        <ShieldCheck size={12} /> sandboxed
      </span>
    </div>
  );
}

export function ScriptInputs({ result, values, onChange }: { result: ScriptResult | null; values: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  if (!result?.ok || result.inputs.length === 0) return null;
  return (
    <div className="script-inputs" data-testid="script-inputs">
      {result.inputs.map((inp) => (
        <label key={inp.name} className="field">
          <span className="label">{inp.name}</span>
          <input
            className="input mono"
            type="number"
            value={values[inp.name] ?? inp.def}
            min={inp.min ?? undefined}
            max={inp.max ?? undefined}
            step={inp.step ?? (Number.isInteger(inp.def) ? 1 : 'any')}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              const next = { ...values };
              if (Number.isFinite(v) && v !== inp.def) next[inp.name] = v;
              else delete next[inp.name];
              onChange(next);
            }}
            aria-label={`Input ${inp.name}`}
          />
        </label>
      ))}
    </div>
  );
}

export function ScriptPreview({ result, color }: { result: ScriptResult | null; color: string }) {
  const w = 520;
  const h = 96;
  if (!result?.ok) return <div className="preview-empty">{result ? 'Fix the error to see a preview.' : 'Preview appears after the script runs.'}</div>;
  const tail = 200;
  const series = result.plots.map((p) => p.values.slice(-tail));
  const nums = [...series.flat(), ...result.hlines.map((x) => x.value)].filter((v): v is number => v != null);
  if (nums.length < 2) return <div className="preview-empty">Plots are empty over the last {tail} bars.</div>;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const y = (v: number) => h - 4 - ((v - lo) / span) * (h - 8);
  const len = series[0]?.length ?? 0;
  const x = (i: number) => (i / Math.max(1, len - 1)) * w;
  return (
    <div className="preview script-preview" aria-label="Script preview" data-testid="script-preview">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h}>
        {result.hlines.map((l, k) => (
          <line key={`h${k}`} x1={0} x2={w} y1={y(l.value)} y2={y(l.value)} stroke="var(--text-faint)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {result.plots.map((p, k) => {
          const c = plotColor(result, k, color);
          if (p.style === 'histogram') {
            const zero = y(Math.min(Math.max(0, lo), hi));
            const bw = Math.max(1, w / len - 1);
            return (
              <g key={k} opacity={0.75}>
                {series[k].map((v, i) => (v == null ? null : <rect key={i} x={x(i) - bw / 2} width={bw} y={Math.min(zero, y(v))} height={Math.max(0.5, Math.abs(zero - y(v)))} fill={p.color ?? (v >= 0 ? 'var(--profit)' : 'var(--loss)')} />))}
              </g>
            );
          }
          let d = '';
          let pen = false;
          series[k].forEach((v, i) => {
            if (v == null) return void (pen = false);
            d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
            pen = true;
          });
          return <path key={k} d={d} fill="none" stroke={c} strokeWidth={1.4} strokeDasharray={p.style === 'dashed' ? '4 3' : undefined} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <span className="preview-range mono">
        {fmtPrice(hi)} / {fmtPrice(lo)}
      </span>
      <div className="plot-legend">
        {result.plots.map((p, k) => (
          <span key={k}>
            <i style={{ background: plotColor(result, k, color) }} />
            {p.title}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ScriptConsole({ result }: { result: ScriptResult | null }) {
  const logs = result?.logs ?? [];
  if (!logs.length) return null;
  return (
    <div className="script-console mono" data-testid="script-console">
      <div className="label">
        <Terminal size={11} /> Console
      </div>
      {logs.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

const API: [string, string][] = [
  ['open high low close volume time', 'Arrays, one value per candle, oldest first (frozen)'],
  ['hl2 hlc3 ohlc4 · n', 'Derived price arrays · number of candles'],
  ['input(name, default, {min, max, step})', 'A tunable number, editable below the editor and per chart instance'],
  ['plot(series, {title, color, style})', "Draw a series. style: 'line' | 'dashed' | 'histogram' (pane only). Max 8"],
  ['hline(value, {title})', 'Horizontal level (e.g. 70 / 30). Max 8'],
  ['each((i, prev) => value)', 'Run a function per candle, oldest → newest; prev = values so far'],
  ['zip((a, b, …) => value, s1, s2, …)', 'Combine series element-wise; any null input gives null'],
  ['ta.sma ema rma wma stdev highest lowest sum (s, len)', 'Rolling functions; warm-up bars are null'],
  ['ta.rsi(s, len) · ta.change / ta.roc(s, len)', 'Momentum'],
  ['ta.atr(len) · ta.tr() · ta.vwap()', 'Range & volume-weighted'],
  ['ta.crossover / ta.crossunder(a, b)', 'Boolean series (plots as 1 / 0)'],
  ['nz(x, d) · na · log(…) / console.log(…)', 'Null helpers · print to the console below (max 50 lines)'],
];

export function ScriptHelp() {
  return (
    <details className="formula-help">
      <summary>Script reference</summary>
      <div className="formula-help-body">
        <p className="faint">
          Plain JavaScript (ES2023). Your script runs once over the whole candle history and draws with <code>plot()</code>. It runs in an isolated QuickJS engine compiled to WebAssembly,
          inside a Web Worker: no network, DOM, storage or timers; {DEFAULT_LIMITS.timeMs / 1000}s CPU and {DEFAULT_LIMITS.memoryBytes / 1024 / 1024} MB memory per run.
        </p>
        <table className="api-table">
          <tbody>
            {API.map(([sig, doc]) => (
              <tr key={sig}>
                <td>
                  <code>{sig}</code>
                </td>
                <td>{doc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
