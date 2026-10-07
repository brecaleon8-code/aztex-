import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CandlestickChart, LayoutGrid, Navigation, Zap, Clock, Palette, CornerDownLeft } from 'lucide-react';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fuzzyFilter } from '@/lib/fuzzy';
import { fmtPct, fmtPrice } from '@/lib/format';
import { useMarketStore } from '@/stores/useMarketStore';
import { useLayoutStore, ALL_PANELS, WORKSPACES } from '@/stores/useLayoutStore';
import { useChartStore } from '@/stores/useChartStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { usePositionStore } from '@/stores/usePositionStore';
import { flattenAll } from '@/stores/trading';
import { useUiStore } from '@/stores/useUiStore';
import { PANEL_LABELS } from '@/modules/terminal/TerminalPage';
import type { ChartMode, Timeframe } from '@/types';
import { NAV } from './TopBar';
import './palette.css';

type Group = 'Symbols' | 'Go to' | 'Workspaces' | 'Panels' | 'Chart' | 'Actions';
interface Command {
  id: string;
  group: Group;
  label: string;
  hint?: ReactNode;
  keywords?: string;
  run: () => void;
}

const GROUP_ICON: Record<Group, ReactNode> = {
  Symbols: <CandlestickChart size={14} />,
  'Go to': <Navigation size={14} />,
  Workspaces: <LayoutGrid size={14} />,
  Panels: <LayoutGrid size={14} />,
  Chart: <Clock size={14} />,
  Actions: <Zap size={14} />,
};
/** "⌘K" on Apple platforms, "Ctrl K" elsewhere. */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const MODES: [ChartMode, string][] = [
  ['candles', 'Candles'],
  ['heikin', 'Heikin-Ashi'],
  ['bars', 'OHLC bars'],
  ['line', 'Line'],
  ['area', 'Area'],
];

/** ⌘K / Ctrl+K: one fuzzy box for symbols, navigation, layout, chart settings and actions. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const assets = useMarketStore((s) => s.assets);
  const workspace = useLayoutStore((s) => s.workspace);
  const panels = useLayoutStore((s) => s.workspaces[s.workspace]);
  const theme = useThemeStore((s) => s.theme);
  const profile = useChartStore((s) => s.profile);
  const hasPositions = usePositionStore((s) => s.positions.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('aztex:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('aztex:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setHl(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const toTerminal = () => navigate('/terminal');
    const cmds: Command[] = [];
    for (const a of ASSET_UNIVERSE) {
      const q = assets[a.symbol];
      cmds.push({
        id: `sym-${a.symbol}`,
        group: 'Symbols',
        label: `${a.symbol}  ${a.name}`,
        keywords: `${a.symbol} ${a.name} chart`,
        hint: (
          <span className="mono">
            {fmtPrice(q.price)} <span className={q.change24h >= 0 ? 'up' : 'down'}>{fmtPct(q.change24h)}</span>
          </span>
        ),
        run: () => {
          useMarketStore.getState().select(a.symbol);
          toTerminal();
        },
      });
    }
    for (const n of NAV) cmds.push({ id: `nav-${n.to}`, group: 'Go to', label: n.label, hint: <kbd>{n.key}</kbd>, run: () => navigate(n.to) });
    for (const w of WORKSPACES)
      cmds.push({
        id: `ws-${w.id}`,
        group: 'Workspaces',
        label: `${w.label} workspace`,
        hint: w.id === workspace ? 'current' : w.hint,
        run: () => {
          useLayoutStore.getState().setWorkspace(w.id);
          toTerminal();
        },
      });
    for (const p of ALL_PANELS) {
      const on = panels.includes(p);
      cmds.push({
        id: `panel-${p}`,
        group: 'Panels',
        label: `${on ? 'Hide' : 'Show'} ${PANEL_LABELS[p]}`,
        keywords: `panel ${PANEL_LABELS[p]}`,
        hint: on ? 'on' : 'off',
        run: () => {
          useLayoutStore.getState().togglePanel(p);
          toTerminal();
        },
      });
    }
    for (const tf of TIMEFRAMES) cmds.push({ id: `tf-${tf}`, group: 'Chart', label: `Timeframe ${tf}`, keywords: `interval ${tf}`, run: () => useMarketStore.getState().setTimeframe(tf) });
    for (const [m, label] of MODES) cmds.push({ id: `mode-${m}`, group: 'Chart', label: `Chart style: ${label}`, run: () => useChartStore.getState().setMode(m) });
    cmds.push({ id: 'vp', group: 'Chart', label: `${profile ? 'Hide' : 'Show'} volume profile`, keywords: 'vp poc value area', run: () => useChartStore.getState().toggleProfile() });
    cmds.push({ id: 'theme', group: 'Actions', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, hint: <Palette size={12} />, run: () => useThemeStore.getState().toggleTheme() });
    cmds.push({ id: 'reset', group: 'Actions', label: 'Reset workspace layout', run: () => useLayoutStore.getState().resetLayout() });
    cmds.push({ id: 'src-mock', group: 'Actions', label: 'Data source: simulated', run: () => useMarketStore.getState().setProvider('mock') });
    cmds.push({ id: 'src-live', group: 'Actions', label: 'Data source: Binance live', run: () => useMarketStore.getState().setProvider('live') });
    cmds.push({ id: 'deposit', group: 'Actions', label: 'Add crypto (deposit)', keywords: 'deposit fund wallet address receive', run: () => useUiStore.getState().openDeposit() });
    cmds.push({ id: 'redeem', group: 'Actions', label: 'Redeem partner / LP code', keywords: 'referral fee tier discount', run: () => navigate('/account') });
    cmds.push({ id: 'new-strategy', group: 'Actions', label: 'Build a strategy / indicator', keywords: 'studio backtest custom', run: () => navigate('/studio') });
    if (hasPositions) cmds.push({ id: 'flatten', group: 'Actions', label: 'Flatten all positions', keywords: 'close all', run: () => void flattenAll() });
    return cmds;
  }, [assets, navigate, workspace, panels, theme, profile, hasPositions]);

  const results = useMemo(() => fuzzyFilter(commands, q, (c) => `${c.label} ${c.keywords ?? ''} ${c.group}`, 60), [commands, q]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${hl}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hl]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  let lastGroup: Group | null = null;
  return (
    <div className="palette-scrim" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()} data-testid="command-palette">
        <div className="palette-input">
          <Search size={15} className="faint" />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search symbols, pages, panels, actions…"
            aria-label="Command palette search"
            onChange={(e) => {
              setQ(e.target.value);
              setHl(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHl((h) => Math.min(results.length - 1, h + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHl((h) => Math.max(0, h - 1));
              } else if (e.key === 'Enter') run(results[hl]);
              else if (e.key === 'Escape') setOpen(false);
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={listRef} role="listbox">
          {results.length === 0 && <div className="empty">No matches for “{q}”</div>}
          {results.map((c, i) => {
            const header = !q.trim() && c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <div className="palette-group">{c.group}</div>}
                <button
                  data-idx={i}
                  role="option"
                  aria-selected={i === hl}
                  className={`palette-item ${i === hl ? 'hl' : ''}`}
                  onMouseMove={() => setHl(i)}
                  onClick={() => run(c)}
                >
                  <span className="palette-icon">{GROUP_ICON[c.group]}</span>
                  <span className="grow palette-label">{c.label}</span>
                  {c.hint && <span className="palette-hint">{c.hint}</span>}
                  {i === hl && <CornerDownLeft size={12} className="faint" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>{MOD_KEY}</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}
