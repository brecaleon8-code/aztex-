import { useEffect, useRef, useState } from 'react';
import { FunctionSquare, Plus } from 'lucide-react';
import { useChartStore } from '@/stores/useChartStore';
import { CATEGORICAL } from '@/stores/useThemeStore';
import { Segmented } from '@/components/ui/Segmented';
import { compile } from '@/lib/indicators/formula';
import type { IndicatorInstance } from '@/types';

type Preset = Omit<IndicatorInstance, 'id'> & { label: string };

export const PRESETS: Preset[] = [
  { label: 'SMA 20', kind: 'sma', type: 'overlay', period: 20, color: CATEGORICAL[1] },
  { label: 'SMA 50', kind: 'sma', type: 'overlay', period: 50, color: CATEGORICAL[2] },
  { label: 'EMA 21', kind: 'ema', type: 'overlay', period: 21, color: CATEGORICAL[0] },
  { label: 'Bollinger 20, 2', kind: 'bollinger', type: 'overlay', period: 20, mult: 2, color: CATEGORICAL[3] },
  { label: 'RSI 14', kind: 'rsi', type: 'oscillator', period: 14, color: CATEGORICAL[4] },
  { label: 'MACD 12, 26, 9', kind: 'macd', type: 'oscillator', fast: 12, slow: 26, signal: 9, color: CATEGORICAL[1] },
  { label: 'Volume', kind: 'volume', type: 'oscillator', color: CATEGORICAL[5] },
];

const EXAMPLES = ['sma(close,20) - sma(close,50)', '(high + low + close) / 3', 'ema(close, 9)', 'close - ema(close, 50)'];

export function IndicatorMenu() {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const addIndicator = useChartStore((s) => s.addIndicator);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn sm" onClick={() => { setOpen((o) => !o); setCustom(false); }} data-testid="add-indicator">
        <Plus size={12} /> Indicator
      </button>
      {open && (
        <div className="menu" style={{ left: 0, top: 30, width: custom ? 330 : 220 }}>
          {!custom ? (
            <>
              {PRESETS.map(({ label, ...p }) => (
                <button key={label} className="menu-item" onClick={() => { addIndicator(p); setOpen(false); }}>
                  <span className="chip" style={{ height: 8, width: 8, padding: 0, background: p.color, border: 0 }} />
                  <span className="grow">{label}</span>
                  <span className="label">{p.type === 'overlay' ? 'overlay' : 'pane'}</span>
                </button>
              ))}
              <div className="divider" />
              <button className="menu-item" onClick={() => setCustom(true)} data-testid="custom-indicator">
                <FunctionSquare size={14} /> <span className="grow">Custom formula…</span>
              </button>
            </>
          ) : (
            <CustomForm onDone={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}

function CustomForm({ onDone }: { onDone: () => void }) {
  const addIndicator = useChartStore((s) => s.addIndicator);
  const count = useChartStore((s) => s.indicators.length);
  const [name, setName] = useState('My indicator');
  const [formula, setFormula] = useState('sma(close,20) - sma(close,50)');
  const [color, setColor] = useState(CATEGORICAL[count % CATEGORICAL.length]);
  const [type, setType] = useState<'overlay' | 'oscillator'>('oscillator');
  const result = compile(formula);

  const submit = () => {
    if (!result.ok) return;
    addIndicator({ kind: 'custom', type, color, name: name.trim() || 'Custom', formula });
    onDone();
  };

  return (
    <div className="col" style={{ gap: 10, padding: 6 }}>
      <label className="field">
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Formula</span>
        <input
          className={`input mono ${result.ok ? '' : 'invalid'}`}
          style={{ borderColor: result.ok ? undefined : 'var(--loss)' }}
          value={formula}
          spellCheck={false}
          onChange={(e) => setFormula(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          data-testid="formula-input"
        />
        {result.ok ? (
          <span className="label">Series: close open high low volume · fns: sma(x, n) ema(x, n) · + − × ÷ ( )</span>
        ) : (
          <span className="error-text" data-testid="formula-error">
            {result.error} <span className="mono faint">(col {result.pos + 1})</span>
          </span>
        )}
      </label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip mono" onClick={() => setFormula(ex)} style={{ fontSize: 10.5 }}>
            {ex}
          </button>
        ))}
      </div>
      <div className="row">
        <Segmented
          value={type}
          onChange={setType}
          ariaLabel="Render as"
          options={[
            { value: 'overlay', label: 'Overlay' },
            { value: 'oscillator', label: 'Own panel' },
          ]}
        />
        <span className="spacer" />
        <div className="row" style={{ gap: 3 }}>
          {CATEGORICAL.map((c) => (
            <button key={c} aria-label={`Color ${c}`} onClick={() => setColor(c)} className="color-dot" style={{ background: c, outline: c === color ? '2px solid var(--text)' : 'none' }} />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-input" aria-label="Custom color" />
        </div>
      </div>
      <button className="btn primary" disabled={!result.ok} onClick={submit} data-testid="formula-add">
        Add indicator
      </button>
    </div>
  );
}
