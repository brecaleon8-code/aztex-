import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

/** Decimals needed to show multiples of `step`. */
export const decimalsOf = (step: number) => Math.max(0, Math.min(8, Math.ceil(-Math.log10(step) - 1e-9)));

/**
 * MT5-style value stepper: − / value / +, with press-and-hold auto-repeat. The field accepts typed
 * values too (committed on blur / Enter).
 */
export function Stepper({ value, onChange, step, label, testId, min = 0, suffix, decimals }: { value: number; onChange: (v: number) => void; step: number; label: string; testId?: string; min?: number; suffix?: string; decimals?: number }) {
  // Shown decimals: the step's by default; prices pass their tick's (the buttons still move a whole step).
  const dec = Math.max(decimals ?? 0, decimalsOf(step));
  const [draft, setDraft] = useState(value.toFixed(dec));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value.toFixed(dec));
  }, [value, dec]);
  const latest = useRef(value);
  latest.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bump = (dir: 1 | -1) => {
    const next = Math.max(min, Number((Math.round(latest.current / step) * step + dir * step).toFixed(dec)));
    latest.current = next;
    onChange(next);
  };
  const hold = (dir: 1 | -1) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      bump(dir);
      const repeat = (delay: number) => {
        timer.current = setTimeout(() => {
          bump(dir);
          repeat(Math.max(45, delay * 0.82));
        }, delay);
      };
      repeat(380);
    },
    onPointerUp: () => timer.current && clearTimeout(timer.current),
    onPointerLeave: () => timer.current && clearTimeout(timer.current),
    onPointerCancel: () => timer.current && clearTimeout(timer.current),
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const commit = () => {
    editing.current = false;
    const v = Number(draft.replace(/,/g, ''));
    if (Number.isFinite(v) && v >= min) onChange(v);
    else setDraft(value.toFixed(dec));
  };
  return (
    <div className="m-stepper" data-testid={testId}>
      <button type="button" className="m-step" aria-label={`Decrease ${label}`} {...hold(-1)}>
        <Minus size={16} />
      </button>
      <label className="m-step-field">
        <span className="m-step-label">{label}</span>
        <input
          className="mono"
          inputMode="decimal"
          value={draft}
          aria-label={label}
          onFocus={() => (editing.current = true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        {suffix && <span className="m-step-suffix">{suffix}</span>}
      </label>
      <button type="button" className="m-step" aria-label={`Increase ${label}`} {...hold(1)}>
        <Plus size={16} />
      </button>
    </div>
  );
}
