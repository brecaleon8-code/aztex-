import { useRef, useState } from 'react';
import { execCli, type CliResult } from './cliExec';
import './cli.css';

/**
 * Always-on command bar, fixed to the viewport bottom across every route. Intentionally a literal
 * dark terminal (phosphor green on near-black) in BOTH themes — it does not use theme tokens.
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
        <span className="cli-prompt">❯</span>
        <input
          aria-label="Command line"
          placeholder="buy 0.1 btc · theme light · help"
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
      </label>
    </div>
  );
}
