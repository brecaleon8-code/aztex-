import { useRef, useState } from 'react';
import { execCli, type CliResult } from './cliExec';
import './cli.css';

/**
 * Always-on command line across every route (terminal-style, with a <GO> key). It stays a literal
 * dark terminal in BOTH themes — it does not use theme tokens.
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
      <div className="cli-result" data-testid="cli-result">
        {result ? (
          <>
            <span className={result.ok ? 'cli-ok' : 'cli-err'}>{result.ok ? '✓' : '✗'}</span> {result.text}
          </>
        ) : (
          <span className="cli-dim">type help for commands · ↑/↓ history</span>
        )}
      </div>
      <label className="cli-line">
        <span className="cli-prompt">CMD</span>
        <input
          aria-label="Command line"
          placeholder="BUY 0.1 BTC · ETH · WATCH SOL · THEME LIGHT · HELP   (press / to focus)"
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
          &lt;GO&gt;
        </button>
      </label>
    </div>
  );
}
