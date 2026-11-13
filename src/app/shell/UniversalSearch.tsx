import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search, SquareTerminal } from 'lucide-react';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { parseCli } from '@/lib/trading/cli';
import { fmtPct, fmtPrice } from '@/lib/format';
import { useMarketStore } from '@/stores/useMarketStore';
import { toast } from '@/stores/useToastStore';
import { execCli } from '@/modules/terminal/cliExec';
import { REGISTRY } from '@/workspace/registry';
import { useWorkspaceStore } from '@/workspace/useWorkspaceStore';
import { ACCOUNT_NAV, NAV, scopeForPath } from './nav';

interface Result {
  id: string;
  group: 'Command' | 'Symbols' | 'Windows' | 'Go to';
  label: ReactNode;
  hint?: ReactNode;
  run: () => void;
}

const SYMBOLS = ASSET_UNIVERSE.map((a) => a.symbol);
export const SEARCH_FOCUS_EVENT = 'aztex:focus-search';

/**
 * One field for everything: a symbol (loads it into the linked windows), a window or page by name
 * ("chart", "otc"), or a command-line instruction ("buy 0.1 btc"), with results underneath.
 * "/" focuses it from anywhere.
 */
export function UniversalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const assets = useMarketStore((s) => s.assets);

  useEffect(() => {
    const focus = () => {
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener(SEARCH_FOCUS_EVENT, focus);
    return () => window.removeEventListener(SEARCH_FOCUS_EVENT, focus);
  }, []);

  const results = useMemo<Result[]>(() => {
    const text = q.trim();
    const t = text.toLowerCase();
    if (!t) return [];
    const out: Result[] = [];
    const parsed = parseCli(text, SYMBOLS);
    if (parsed.ok && parsed.cmd.kind !== 'jump')
      out.push({
        id: 'cmd',
        group: 'Command',
        label: (
          <>
            Run <span className="mono">{text}</span>
          </>
        ),
        hint: <CornerDownLeft size={12} />,
        run: () => {
          const r = execCli(text);
          toast({ kind: r.ok ? 'success' : 'error', title: r.ok ? 'Command run' : 'Command failed', detail: r.text });
        },
      });
    for (const a of ASSET_UNIVERSE) {
      if (out.filter((r) => r.group === 'Symbols').length >= 6) break;
      if (a.symbol.toLowerCase().startsWith(t) || a.name.toLowerCase().includes(t)) {
        const live = assets[a.symbol];
        out.push({
          id: `sym-${a.symbol}`,
          group: 'Symbols',
          label: (
            <>
              <b className="mono">{a.symbol}</b> <span className="faint">{a.name}</span>
            </>
          ),
          hint: live && (
            <span className="mono">
              {fmtPrice(live.price)} <span className={live.change24h >= 0 ? 'up' : 'down'}>{fmtPct(live.change24h)}</span>
            </span>
          ),
          run: () => useMarketStore.getState().select(a.symbol),
        });
      }
    }
    for (const d of Object.values(REGISTRY)) {
      if (!d.title.toLowerCase().includes(t) && !d.type.toLowerCase().includes(t)) continue;
      const Icon = d.icon;
      out.push({
        id: `win-${d.type}`,
        group: 'Windows',
        label: (
          <>
            <Icon size={13} /> Open {d.title}
          </>
        ),
        hint: 'window',
        run: () => {
          // Docked routes take it into their active tab; plain pages open it on the terminal.
          const scope = scopeForPath(pathname);
          if (!scope) navigate('/terminal');
          requestAnimationFrame(() => useWorkspaceStore.getState().addWindow(d.type, { scope: scope ?? 'terminal' }));
        },
      });
    }
    for (const n of [...NAV, ACCOUNT_NAV])
      if (n.label.toLowerCase().includes(t))
        out.push({ id: `nav-${n.to}`, group: 'Go to', label: n.label, hint: <kbd className="cm-kbd">{n.key}</kbd>, run: () => navigate(n.to) });
    if (out.length === 0)
      out.push({
        id: 'cmd-any',
        group: 'Command',
        label: (
          <>
            <SquareTerminal size={13} /> Run as command: <span className="mono">{text}</span>
          </>
        ),
        run: () => {
          const r = execCli(text);
          toast({ kind: r.ok ? 'success' : 'error', title: r.ok ? 'Command run' : 'Not a command', detail: r.text });
        },
      });
    return out;
  }, [q, assets, navigate, pathname]);

  useEffect(() => {
    setHi(0);
  }, [q]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const pick = (r: Result | undefined) => {
    if (!r) return;
    r.run();
    setQ('');
    setOpen(false);
    input.current?.blur();
  };

  let lastGroup = '';
  return (
    <div className="usearch" ref={box} data-testid="universal-search">
      <Search size={13} className="faint" />
      <input
        ref={input}
        value={q}
        placeholder="Search symbols, windows or type a command"
        aria-label="Search symbols, windows and commands"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="usearch-list"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(results.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === 'Enter') pick(results[hi]);
          else if (e.key === 'Escape') {
            e.preventDefault();
            setQ('');
            setOpen(false);
            input.current?.blur();
          }
        }}
      />
      <kbd className="usearch-key">/</kbd>
      {open && results.length > 0 && (
        <div className="menu usearch-list" id="usearch-list" role="listbox" data-testid="search-results">
          {results.map((r, i) => {
            const head = r.group !== lastGroup ? <div className="menu-group">{r.group}</div> : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {head}
                <button role="option" aria-selected={i === hi} className={`menu-item ${i === hi ? 'hl' : ''}`} onPointerEnter={() => setHi(i)} onClick={() => pick(r)} data-testid={`search-${r.id}`}>
                  <span className="grow usearch-label">{r.label}</span>
                  {r.hint && <span className="faint usearch-hint">{r.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
