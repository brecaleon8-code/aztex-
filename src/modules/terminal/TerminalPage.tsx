import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { RotateCcw, LayoutGrid, Check, Keyboard } from 'lucide-react';
import { useLayoutStore, ALL_PANELS, WORKSPACES, type PanelId } from '@/stores/useLayoutStore';
import type { PanelDragProps } from '@/components/ui/Panel';
import { Watchlist } from './Watchlist';
import { ChartPanel } from './chart/ChartPanel';
import { OrderBook } from './OrderBook';
import { OrderTicket } from './OrderTicket';
import { Positions } from './Positions';
import { PnlChart } from './PnlChart';
import { TimeSales } from './TimeSales';
import { OrderFlow } from './OrderFlow';
import { News } from './News';
import { Blotter } from './Blotter';
import { useThemeStore } from '@/stores/useThemeStore';
import { BOTTOM_TIER, FIT_FLEX, MIN_W, fitRows } from '@/lib/layout/fit';
import { TerminalFitContext } from './fitContext';
import './terminal.css';

const PANELS: Record<PanelId, (drag: PanelDragProps) => ReactNode> = {
  watchlist: (d) => <Watchlist drag={d} />,
  chart: (d) => <ChartPanel drag={d} />,
  orderbook: (d) => <OrderBook drag={d} />,
  ticket: (d) => <OrderTicket drag={d} />,
  positions: (d) => <Positions drag={d} />,
  pnl: (d) => <PnlChart drag={d} />,
  tape: (d) => <TimeSales drag={d} />,
  flow: (d) => <OrderFlow drag={d} />,
  news: (d) => <News drag={d} />,
  orders: (d) => <Blotter drag={d} />,
};

export const PANEL_LABELS: Record<PanelId, string> = {
  watchlist: 'Watchlist',
  chart: 'Chart',
  orderbook: 'Order book',
  ticket: 'Order ticket',
  positions: 'Positions',
  pnl: 'P/L',
  tape: 'Time & sales',
  flow: 'Order flow',
  news: 'News',
  orders: 'Orders & fills',
};

/** Flex basis per panel; order comes from the persisted layout store (flexbox `order`). */
function panelStyle(id: PanelId, maximized: boolean): CSSProperties {
  switch (id) {
    case 'watchlist':
      return { flex: '0 1 300px', minWidth: 260 };
    case 'chart':
      return maximized ? { flex: '1 1 100%' } : { flex: '999 1 560px' };
    case 'orderbook':
      return { flex: '0 1 290px', minWidth: 250 };
    case 'tape':
      return { flex: '0 1 300px', minWidth: 280 };
    case 'ticket':
      return { flex: '0 1 300px', minWidth: 270 };
    case 'positions':
      return { flex: '3 1 520px' };
    case 'flow':
      return { flex: '1 1 300px', minWidth: 280 };
    case 'news':
      return { flex: '2 1 420px' };
    case 'pnl':
      return { flex: '1 1 360px' };
    case 'orders':
      return { flex: '2 1 460px' };
  }
}

export function TerminalPage() {
  const workspace = useLayoutStore((s) => s.workspace);
  const order = useLayoutStore((s) => s.workspaces[s.workspace]);
  const maximized = useLayoutStore((s) => s.chartMaximized);
  const bottomFrac = useLayoutStore((s) => s.bottomFrac);
  const platform = useThemeStore((s) => s.platform);
  const { movePanel, resetLayout, setWorkspace } = useLayoutStore.getState();
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [over, setOver] = useState<PanelId | null>(null);

  // Measure the visible area below the workspace bar so panels can share it exactly.
  const gridRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0, gap: 8 });
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const content = grid?.closest('.content') as HTMLElement | null;
    if (!grid || !content) return;
    const measure = () => {
      const cs = getComputedStyle(content);
      const top = grid.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - parseFloat(cs.paddingTop);
      const inner = content.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const next = { w: Math.floor(grid.clientWidth), h: Math.floor(inner - top), gap: parseFloat(getComputedStyle(grid).rowGap) || 8 };
      setBox((b) => (b.w === next.w && b.h === next.h && b.gap === next.gap ? b : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    ro.observe(grid);
    const bar = grid.previousElementSibling;
    if (bar) ro.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Fit-to-screen on desktop widths; small screens and the Mobile preview keep a scrolling stack.
  const fit = platform !== 'mobile' && box.w >= 960 && box.h >= 420;
  const rows = fit ? fitRows({ order, width: box.w, height: box.h, gap: box.gap, maximized, bottomFrac }) : null;
  const lastRow = rows?.[rows.length - 1];
  const bottomH = rows && rows.length > 1 && lastRow!.ids.every((id) => BOTTOM_TIER.has(id)) ? lastRow!.h : 0;
  const fitCtx = useMemo(() => (fit ? { height: box.h, bottomH } : null), [fit, box.h, bottomH]);

  const tile = (id: PanelId, style: CSSProperties) => (
    <div
      key={id}
      className={`tile ${dragging === id ? 'dragging' : ''} ${over === id && dragging && dragging !== id ? 'drop-target' : ''}`}
      style={{ ...style, order: order.indexOf(id), ['--i' as string]: order.indexOf(id) }}
      data-panel={id}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (over !== id) setOver(id);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === id ? null : o));
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (dragging) movePanel(dragging, id);
        setDragging(null);
        setOver(null);
      }}
    >
      {PANELS[id]({
        draggable: true,
        onDragStart: (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
          setDragging(id);
        },
        onDragEnd: () => {
          setDragging(null);
          setOver(null);
        },
      })}
    </div>
  );

  return (
    <TerminalFitContext.Provider value={fitCtx}>
      <div className={`terminal ${fit ? 'fit' : ''}`}>
        <div className="ws-bar">
          <div className="ws-tabs" role="tablist" aria-label="Workspaces">
            {WORKSPACES.map((w) => (
              <button key={w.id} role="tab" aria-selected={workspace === w.id} className={`ws-tab ${workspace === w.id ? 'active' : ''}`} onClick={() => setWorkspace(w.id)} title={w.hint} data-testid={`ws-${w.id}`}>
                {w.label}
              </button>
            ))}
          </div>
          <span className="ws-hint">{WORKSPACES.find((w) => w.id === workspace)?.hint}</span>
          <span className="spacer" />
          <span className="ws-keys faint" title="Drag a panel's header to rearrange · drag the chart's bottom edge to resize rows · F1–F8 switch modules · / focuses the command line">
            <Keyboard size={13} />
          </span>
          <PanelPicker />
          <button className="btn ghost sm" onClick={resetLayout} title="Restore this workspace's default panels and sizes">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
        <div className="terminal-grid" ref={gridRef} data-fit={fit ? 'on' : 'off'}>
          {rows
            ? rows.map((r, i) => (
                <div key={r.ids.join()} className="terminal-row" style={{ height: r.h }} data-testid={i === 0 ? 'terminal-row-main' : undefined}>
                  {r.ids.map((id) => tile(id, { flex: FIT_FLEX[id], minWidth: MIN_W[id] }))}
                </div>
              ))
            : order.map((id) => tile(id, panelStyle(id, maximized)))}
        </div>
      </div>
    </TerminalFitContext.Provider>
  );
}

function PanelPicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const order = useLayoutStore((s) => s.workspaces[s.workspace]);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="panel-picker">
        <LayoutGrid size={12} /> Panels <span className="mono faint">{order.length}</span>
      </button>
      {open && (
        <div className="menu" style={{ right: 0, top: 30, width: 200 }}>
          {ALL_PANELS.map((id) => {
            const on = order.includes(id);
            return (
              <button key={id} className="menu-item" role="menuitemcheckbox" aria-checked={on} onClick={() => togglePanel(id)}>
                <span className={`check ${on ? 'on' : ''}`}>{on && <Check size={11} />}</span>
                {PANEL_LABELS[id]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
