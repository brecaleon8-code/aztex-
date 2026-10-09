import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Eye, EyeOff, Copy, RotateCcw, Trash2, Minus, Plus, Code2, Save, ExternalLink, Play } from 'lucide-react';
import { useChartStore } from '@/stores/useChartStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useStudioStore } from '@/stores/useStudioStore';
import { CATEGORICAL } from '@/stores/useThemeStore';
import { toast } from '@/stores/useToastStore';
import { Segmented } from '@/components/ui/Segmented';
import { indicatorLabel } from '@/lib/indicators/compute';
import { compile } from '@/lib/indicators/formula';
import type { IndicatorInstance, PriceSource } from '@/types';
import { FormulaInput } from '@/modules/studio/FormulaInput';
import { CodeEditor, ScriptStatus, useScriptPreview } from '@/modules/studio/ScriptEditor';
import '@/modules/studio/studio.css';

const SOURCES: PriceSource[] = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'];
const WIDTHS = [1, 1.5, 2, 3];
const KIND_NAME: Record<IndicatorInstance['kind'], string> = {
  sma: 'Simple moving average',
  ema: 'Exponential moving average',
  bollinger: 'Bollinger Bands',
  rsi: 'Relative Strength Index',
  macd: 'MACD',
  volume: 'Volume',
  vwap: 'VWAP (session)',
  cvd: 'Cumulative volume delta',
  custom: 'Formula indicator',
  script: 'Script indicator',
};

/** Factory defaults per kind, for "Reset". */
export const INDICATOR_DEFAULTS: Partial<Record<IndicatorInstance['kind'], Partial<IndicatorInstance>>> = {
  sma: { period: 20, source: 'close' },
  ema: { period: 21, source: 'close' },
  bollinger: { period: 20, mult: 2, source: 'close' },
  rsi: { period: 14, source: 'close', levels: [30, 70] },
  macd: { fast: 12, slow: 26, signal: 9, source: 'close' },
};

/** Compact number field with − / + steppers that commits on every change (live preview). */
function Stepper({ label, value, min, max, step = 1, onChange, testId }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; testId?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, +(Math.round(v / step) * step).toFixed(6)));
  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) onChange(clamp(v));
  };
  return (
    <label className="qe-field">
      <span className="label">{label}</span>
      <span className="qe-stepper">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))} disabled={value <= min}>
          <Minus size={11} />
        </button>
        <input
          className="mono"
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          onBlur={() => setDraft(String(value))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(clamp(value + step));
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(clamp(value - step));
            }
          }}
          aria-label={label}
          data-testid={testId}
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))} disabled={value >= max}>
          <Plus size={11} />
        </button>
      </span>
    </label>
  );
}

/**
 * Quick-edit popover for an indicator on the chart. Every change applies live; formulas apply once
 * they parse, scripts when you press Run. Rendered in a portal so it isn't clipped by the toolbar.
 */
export function QuickEdit() {
  const editing = useChartStore((s) => s.editing);
  const ind = useChartStore((s) => s.indicators.find((i) => i.id === s.editing?.id));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const close = useChartStore((s) => s.closeEditor);

  // Place below the anchor, flipped above / clamped so it always stays on screen.
  useLayoutEffect(() => {
    if (!editing || !ref.current) return;
    const place = () => {
      const el = ref.current!;
      const { x, y, w, h } = editing.anchor;
      const W = el.offsetWidth;
      const H = el.offsetHeight;
      let top = y + h + 6;
      if (top + H > window.innerHeight - 8) top = Math.max(8, y - H - 6);
      const left = Math.min(Math.max(8, x + w / 2 - W / 2), window.innerWidth - W - 8);
      setPos({ left, top });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest('[data-qe-anchor]')) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', close);
    };
  }, [editing, close]);

  if (!editing || !ind) return null;
  return createPortal(
    <div ref={ref} className="qe" role="dialog" aria-label={`Edit ${indicatorLabel(ind)}`} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }} data-testid="quick-edit">
      <Editor key={ind.id} ind={ind} />
    </div>,
    document.body,
  );
}

function Editor({ ind }: { ind: IndicatorInstance }) {
  const { updateIndicator, removeIndicator, duplicateIndicator, toggleIndicatorHidden, closeEditor } = useChartStore.getState();
  const navigate = useNavigate();
  const set = (patch: Partial<IndicatorInstance>) => updateIndicator(ind.id, patch);
  const defaults = INDICATOR_DEFAULTS[ind.kind];
  const hasSource = ind.kind === 'sma' || ind.kind === 'ema' || ind.kind === 'bollinger' || ind.kind === 'rsi' || ind.kind === 'macd';
  const user = ind.kind === 'custom' || ind.kind === 'script';

  return (
    <>
      <div className="qe-head">
        <span className="swatch" style={{ background: ind.color }} />
        {user ? (
          <input className="qe-name" value={ind.name ?? ''} onChange={(e) => set({ name: e.target.value })} aria-label="Indicator name" placeholder="Name" />
        ) : (
          <b>{indicatorLabel(ind)}</b>
        )}
        <span className="faint qe-kind">{KIND_NAME[ind.kind]}</span>
        <span className="spacer" />
        <button className="qe-icon" onClick={closeEditor} aria-label="Close">
          <X size={13} />
        </button>
      </div>

      <div className="qe-body">
        {(ind.kind === 'sma' || ind.kind === 'ema') && (
          <div className="qe-grid">
            <Stepper label="Length" value={ind.period ?? defaults?.period ?? 20} min={1} max={500} onChange={(period) => set({ period })} testId="qe-period" />
          </div>
        )}
        {ind.kind === 'bollinger' && (
          <div className="qe-grid">
            <Stepper label="Length" value={ind.period ?? 20} min={2} max={500} onChange={(period) => set({ period })} testId="qe-period" />
            <Stepper label="Std dev" value={ind.mult ?? 2} min={0.5} max={5} step={0.1} onChange={(mult) => set({ mult })} testId="qe-mult" />
          </div>
        )}
        {ind.kind === 'rsi' && (
          <div className="qe-grid">
            <Stepper label="Length" value={ind.period ?? 14} min={2} max={200} onChange={(period) => set({ period })} testId="qe-period" />
            <Stepper label="Overbought" value={ind.levels?.[1] ?? 70} min={50} max={100} onChange={(v) => set({ levels: [ind.levels?.[0] ?? 30, v] })} testId="qe-ob" />
            <Stepper label="Oversold" value={ind.levels?.[0] ?? 30} min={0} max={50} onChange={(v) => set({ levels: [v, ind.levels?.[1] ?? 70] })} testId="qe-os" />
          </div>
        )}
        {ind.kind === 'macd' && (
          <>
            <div className="qe-grid">
              <Stepper label="Fast" value={ind.fast ?? 12} min={1} max={200} onChange={(fast) => set({ fast })} testId="qe-fast" />
              <Stepper label="Slow" value={ind.slow ?? 26} min={2} max={400} onChange={(slow) => set({ slow })} testId="qe-slow" />
              <Stepper label="Signal" value={ind.signal ?? 9} min={1} max={100} onChange={(signal) => set({ signal })} testId="qe-signal" />
            </div>
            {(ind.fast ?? 12) >= (ind.slow ?? 26) && <span className="warn-text qe-note">Fast should be shorter than slow.</span>}
          </>
        )}
        {hasSource && (
          <label className="qe-field qe-source">
            <span className="label">Source</span>
            <select className="input" value={ind.source ?? 'close'} onChange={(e) => set({ source: e.target.value as PriceSource })} aria-label="Source" data-testid="qe-source">
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {(ind.kind === 'volume' || ind.kind === 'vwap' || ind.kind === 'cvd') && <span className="faint qe-note">No parameters — style only.</span>}
        {ind.kind === 'custom' && <FormulaEdit ind={ind} />}
        {ind.kind === 'script' && <ScriptEdit ind={ind} />}

        <div className="qe-sep" />
        <div className="qe-row">
          <span className="label">Color</span>
          <span className="spacer" />
          <span className="row" style={{ gap: 3 }}>
            {CATEGORICAL.map((c) => (
              <button key={c} aria-label={`Color ${c}`} onClick={() => set({ color: c })} className="color-dot" style={{ background: c, outline: c.toLowerCase() === ind.color.toLowerCase() ? '2px solid var(--text)' : 'none' }} />
            ))}
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(ind.color) ? ind.color : '#7fa7cf'} onChange={(e) => set({ color: e.target.value })} className="color-input" aria-label="Custom color" />
          </span>
        </div>
        {ind.kind !== 'volume' && (
          <div className="qe-row">
            <span className="label">Line width</span>
            <span className="spacer" />
            <Segmented<string>
              ariaLabel="Line width"
              value={String(ind.width ?? (ind.kind === 'vwap' ? 1.5 : 1.5))}
              onChange={(v) => set({ width: +v })}
              options={WIDTHS.map((w) => ({ value: String(w), label: <span className="qe-w" style={{ height: w }} aria-label={`${w}px`} /> }))}
            />
          </div>
        )}
        {user && (
          <div className="qe-row">
            <span className="label">Plot</span>
            <span className="spacer" />
            <Segmented<'overlay' | 'oscillator'>
              ariaLabel="Plot as"
              value={ind.type}
              onChange={(type) => set({ type })}
              options={[
                { value: 'overlay', label: 'On price' },
                { value: 'oscillator', label: 'Own pane' },
              ]}
            />
          </div>
        )}
      </div>

      <div className="qe-foot">
        <button className="btn sm ghost" onClick={() => toggleIndicatorHidden(ind.id)} aria-pressed={!!ind.hidden} data-testid="qe-hide">
          {ind.hidden ? <EyeOff size={12} /> : <Eye size={12} />} {ind.hidden ? 'Show' : 'Hide'}
        </button>
        <button
          className="btn sm ghost"
          onClick={() => {
            const id = duplicateIndicator(ind.id);
            if (id) toast({ kind: 'success', title: 'Indicator duplicated', detail: indicatorLabel(ind) });
          }}
          data-testid="qe-duplicate"
        >
          <Copy size={12} /> Duplicate
        </button>
        {defaults && (
          <button className="btn sm ghost" onClick={() => set({ ...defaults, width: undefined })} title="Back to the default settings" data-testid="qe-reset">
            <RotateCcw size={12} /> Reset
          </button>
        )}
        {user && (
          <>
            <SaveToLibrary ind={ind} />
            <button
              className="btn sm ghost"
              title="Open the full editor in Studio"
              onClick={() => {
                closeEditor();
                navigate('/studio');
              }}
            >
              <ExternalLink size={12} /> Studio
            </button>
          </>
        )}
        <span className="spacer" />
        <button className="btn sm ghost danger" onClick={() => removeIndicator(ind.id)} data-testid="qe-remove">
          <Trash2 size={12} /> Remove
        </button>
      </div>
    </>
  );
}

/** Formula: edits apply as soon as they parse; the chart keeps the last valid formula meanwhile. */
function FormulaEdit({ ind }: { ind: IndicatorInstance }) {
  const [draft, setDraft] = useState(ind.formula ?? '');
  return (
    <FormulaInput
      label="Formula"
      value={draft}
      onChange={(v) => {
        setDraft(v);
        if (v.trim() && compile(v).ok) useChartStore.getState().updateIndicator(ind.id, { formula: v });
      }}
      testId="qe-formula"
    />
  );
}

/** Script: tune its inputs live; open the code to edit and Run to apply. */
function ScriptEdit({ ind }: { ind: IndicatorInstance }) {
  const candles = useMarketStore((s) => s.candles);
  const symbol = useMarketStore((s) => s.selected);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState(ind.script ?? '');
  const preview = useScriptPreview(code, ind.inputs ?? {}, candles, symbol);
  const r = preview.result;
  const dirty = code !== (ind.script ?? '');
  const values = ind.inputs ?? {};
  return (
    <div className="qe-script">
      {r?.ok && r.inputs.length > 0 ? (
        <div className="qe-grid">
          {r.inputs.map((inp) => (
            <Stepper
              key={inp.name}
              label={inp.name}
              value={values[inp.name] ?? inp.def}
              min={inp.min ?? -1e9}
              max={inp.max ?? 1e9}
              step={inp.step ?? (Number.isInteger(inp.def) ? 1 : 0.1)}
              onChange={(v) => {
                const next = { ...values, [inp.name]: v };
                if (v === inp.def) delete next[inp.name];
                useChartStore.getState().updateIndicator(ind.id, { inputs: next });
              }}
              testId={`qe-input-${inp.name}`}
            />
          ))}
        </div>
      ) : (
        !showCode && <span className="faint qe-note">{r && !r.ok ? 'Script has an error — open the code to fix it.' : r ? 'This script has no inputs.' : 'Reading script inputs…'}</span>
      )}
      <button className="btn sm ghost qe-code-toggle" onClick={() => setShowCode((v) => !v)} aria-expanded={showCode} data-testid="qe-code-toggle">
        <Code2 size={12} /> {showCode ? 'Hide code' : 'Edit code'}
      </button>
      {showCode && (
        <>
          <CodeEditor value={code} onChange={setCode} errorLine={r && !r.ok ? r.line : undefined} testId="qe-code" />
          <ScriptStatus result={r} running={preview.running} onRun={preview.rerun} />
          <button
            className="btn sm primary"
            disabled={!dirty || !r?.ok}
            onClick={() => {
              useChartStore.getState().updateIndicator(ind.id, { script: code });
              toast({ kind: 'success', title: 'Script applied', detail: ind.name ?? 'Script' });
            }}
            data-testid="qe-apply-code"
          >
            <Play size={12} /> Apply to chart
          </button>
        </>
      )}
    </div>
  );
}

/** Push the chart copy's settings back into the Studio library (update its source, or save new). */
function SaveToLibrary({ ind }: { ind: IndicatorInstance }) {
  const lib = useStudioStore((s) => s.indicators);
  const existing = ind.studioId ? lib.find((x) => x.id === ind.studioId) : undefined;
  return (
    <button
      className="btn sm ghost"
      title={existing ? `Update “${existing.name}” in your Studio library` : 'Save to your Studio library'}
      onClick={() => {
        const saved = useStudioStore.getState().saveIndicator({
          id: existing?.id,
          name: ind.name || (ind.kind === 'script' ? 'Script' : 'Formula'),
          lang: ind.kind === 'script' ? 'script' : 'formula',
          formula: ind.formula ?? '',
          script: ind.script,
          inputs: ind.inputs,
          type: ind.type,
          color: ind.color,
          notes: existing?.notes,
        });
        useChartStore.getState().updateIndicator(ind.id, { studioId: saved.id });
        toast({ kind: 'success', title: existing ? 'Library updated' : 'Saved to library', detail: saved.name });
      }}
      data-testid="qe-save"
    >
      <Save size={12} /> {existing ? 'Update library' : 'Save'}
    </button>
  );
}
