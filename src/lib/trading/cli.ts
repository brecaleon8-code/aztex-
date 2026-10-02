/** CLI command grammar (spec §4). Parsing is pure; execution lives in the terminal module. */
export type CliCommand =
  | { kind: 'order'; side: 'buy' | 'sell'; amount: number; symbol: string }
  | { kind: 'flatten' }
  | { kind: 'watch' | 'unwatch'; symbol: string }
  | { kind: 'theme'; theme: 'dark' | 'light' }
  | { kind: 'jump'; symbol: string }
  | { kind: 'help' };

export type CliParse = { ok: true; cmd: CliCommand } | { ok: false; error: string };

export const CLI_HELP =
  'buy|sell <amount> <symbol> · close all|flatten · watch|unwatch <symbol> · theme dark|light · <symbol> · help';

export function parseCli(line: string, knownSymbols: string[]): CliParse {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Empty command' };
  const [head, ...rest] = parts;
  const cmd = head.toLowerCase();
  const sym = (s: string | undefined): string | null => {
    if (!s) return null;
    const u = s.toUpperCase().replace(/[-/]?USDT?$/, '');
    return knownSymbols.includes(u) ? u : null;
  };

  if (cmd === 'help' || cmd === '?') return { ok: true, cmd: { kind: 'help' } };
  if (cmd === 'flatten' || (cmd === 'close' && rest[0]?.toLowerCase() === 'all' && rest.length === 1))
    return rest.length && cmd === 'flatten' ? { ok: false, error: 'flatten takes no arguments' } : { ok: true, cmd: { kind: 'flatten' } };
  if (cmd === 'buy' || cmd === 'sell') {
    if (rest.length !== 2) return { ok: false, error: `Usage: ${cmd} <amount> <symbol>` };
    const amount = Number(rest[0]);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: `Invalid amount "${rest[0]}"` };
    const s = sym(rest[1]);
    if (!s) return { ok: false, error: `Unknown symbol "${rest[1]}"` };
    return { ok: true, cmd: { kind: 'order', side: cmd, amount, symbol: s } };
  }
  if (cmd === 'watch' || cmd === 'unwatch') {
    if (rest.length !== 1) return { ok: false, error: `Usage: ${cmd} <symbol>` };
    const s = sym(rest[0]);
    if (!s) return { ok: false, error: `Unknown symbol "${rest[0]}"` };
    return { ok: true, cmd: { kind: cmd, symbol: s } };
  }
  if (cmd === 'theme') {
    const t = rest[0]?.toLowerCase();
    if (rest.length !== 1 || (t !== 'dark' && t !== 'light')) return { ok: false, error: 'Usage: theme dark|light' };
    return { ok: true, cmd: { kind: 'theme', theme: t } };
  }
  if (rest.length === 0) {
    const s = sym(head);
    if (s) return { ok: true, cmd: { kind: 'jump', symbol: s } };
  }
  return { ok: false, error: `Unknown command "${head}" — type help` };
}
