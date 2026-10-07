import { compile, FUNCTION_HELP, isCondition } from '@/lib/indicators/formula';

/** Formula textarea with live parse feedback. `condition` warns when a rule isn't a true/false test. */
export function FormulaInput({ label, value, onChange, condition, placeholder, optional, testId }: { label: string; value: string; onChange: (v: string) => void; condition?: boolean; placeholder?: string; optional?: boolean; testId?: string }) {
  const empty = !value.trim();
  const r = empty ? null : compile(value);
  const notCond = condition && r?.ok && !isCondition(r.ast);
  return (
    <label className="field">
      <span className="label">
        {label}
        {optional && <span className="faint"> · optional</span>}
      </span>
      <textarea
        className={`input mono formula-input ${r && !r.ok ? 'invalid' : ''}`}
        rows={2}
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      {r && !r.ok && (
        <span className="error-text" data-testid={testId ? `${testId}-error` : undefined}>
          {r.error} <span className="faint mono">(col {r.pos + 1})</span>
        </span>
      )}
      {notCond && <span className="warn-text label">Tip: rules fire when the value is non-zero — usually a comparison like close &gt; ema(close, 50).</span>}
    </label>
  );
}

export function FormulaHelp() {
  return (
    <details className="formula-help">
      <summary>Formula reference</summary>
      <div className="formula-help-body">
        <p>
          <b>Series</b> <code>close open high low volume</code> · <b>Math</b> <code>+ − × ÷ ( )</code> · <b>Compare</b> <code>&gt; &lt; &gt;= &lt;= == !=</code> · <b>Logic</b>{' '}
          <code>and or not</code>
        </p>
        <p>
          <b>Functions</b>{' '}
          {FUNCTION_HELP.map((f) => (
            <code key={f}>{f}</code>
          ))}
        </p>
        <p className="faint">Rules are evaluated per bar on closed candles; strategy entries and exits fill at the next bar’s open.</p>
      </div>
    </details>
  );
}
