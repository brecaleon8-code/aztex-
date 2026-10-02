import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { RotateCcw, LayoutGrid, Check } from 'lucide-react';
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
  }
}

export function TerminalPage() {
  const workspace = useLayoutStore((s) => s.workspace);
  const order = useLayoutStore((s) => s.workspaces[s.workspace]);
  const maximized = useLayoutStore((s) => s.chartMaximized);
  const { movePanel, resetLayout, setWorkspace } = useLayoutStore.getState();
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [over, setOver] = useState<PanelId | null>(null);

  return (
    <div className="terminal">
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
        <PanelPicker />
        <button className="btn ghost sm" onClick={resetLayout} title="Restore this workspace's default panels">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="terminal-grid">
        {order.map((id, idx) => (
          <div
            key={id}
            className={`tile ${dragging === id ? 'dragging' : ''} ${over === id && dragging && dragging !== id ? 'drop-target' : ''}`}
            style={{ ...panelStyle(id, maximized), order: idx, ['--i' as string]: idx }}
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
        ))}
      </div>
      <div className="terminal-foot">
        <span className="label">Drag a panel's header to rearrange · F1–F5 switch modules · / focuses the command line</span>
      </div>
    </div>
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
