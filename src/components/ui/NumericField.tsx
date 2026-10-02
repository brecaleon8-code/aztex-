import { useEffect, useRef, useState, type ReactNode } from 'react';

interface NumericFieldProps {
  value: number;
  onCommit: (v: number) => void;
  label?: ReactNode;
  hint?: ReactNode;
  suffix?: ReactNode;
  min?: number;
  decimals?: number;
  ariaLabel?: string;
  testId?: string;
}

/**
 * Numeric input that never lets invalid text corrupt numeric state: the raw draft lives locally,
 * and only finite numbers (≥ min) are committed. Clearing the field leaves the last valid value in
 * place; on blur the draft snaps back to it. While not focused it follows external updates.
 */
export function NumericField({ value, onCommit, label, hint, suffix, min = 0, decimals, ariaLabel, testId }: NumericFieldProps) {
  const fmt = (v: number) => (decimals != null ? v.toFixed(decimals) : String(v));
  const [draft, setDraft] = useState(fmt(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(fmt(value));
  }, [value, decimals]);

  const parsed = draft.trim() === '' ? NaN : Number(draft.replace(/,/g, ''));
  const valid = Number.isFinite(parsed) && parsed >= min;

  return (
    <label className="field">
      {label && <span className="label">{label}</span>}
      <span className={`input-wrap ${draft !== '' && !valid ? 'invalid' : ''}`}>
        <input
          className="mono"
          inputMode="decimal"
          aria-label={ariaLabel}
          aria-invalid={draft !== '' && !valid}
          data-testid={testId}
          value={draft}
          onFocus={() => (focused.current = true)}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            const n = raw.trim() === '' ? NaN : Number(raw.replace(/,/g, ''));
            if (Number.isFinite(n) && n >= min) onCommit(n);
          }}
          onBlur={() => {
            focused.current = false;
            setDraft(fmt(value));
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
      {hint && <span className="label">{hint}</span>}
    </label>
  );
}
