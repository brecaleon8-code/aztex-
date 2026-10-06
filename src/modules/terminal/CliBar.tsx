import { useRef, useState } from 'react';
import { execCli, type CliResult } from './cliExec';
import './cli.css';

/**
 * Always-on command line across every route. Keyboard-first: "/" focuses it from anywhere,
 * Enter runs, ↑/↓ walk history.
 */
export function CliBar() {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<CliResult | null>(null);
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);

  const run = () => {
    const line = value.trim();
    if (!line) return;
    history.current = [line, ...history.current.filter((h) => h !== line)].slice(0, 50);
    cursor.current = -1;
    setResult(execCli(line));
    setValue('');
  };

  return (
    <div className="cli" data-testid="cli">
      {/* Result line appears only once something has run; the placeholder carries the hint. */}
      <div className="cli-result" data-testid="cli-result" title={result?.text}>
        {result && (
          <>
            <span className={result.ok ? 'cli-ok' : 'cli-err'}>{result.ok ? '✓' : '✗'}</span> {result.text}
          </>
        )}
      </div>
      <label className="cli-line">
        <span className="cli-prompt">›</span>
        <input
          aria-label="Command line"
          placeholder="Command · buy 0.1 btc · eth · help"
          spellCheck={false}
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run();
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const h = history.current;
              cursor.current = e.key === 'ArrowUp' ? Math.min(h.length - 1, cursor.current + 1) : Math.max(-1, cursor.current - 1);
              setValue(cursor.current >= 0 ? h[cursor.current] : '');
            } else if (e.key === 'Escape') setValue('');
          }}
        />
        <button type="button" className="cli-go" onClick={run} aria-label="Run command">
          Run
        </button>
      </label>
    </div>
  );
}
