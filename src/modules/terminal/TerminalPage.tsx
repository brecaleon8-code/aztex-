import { useState, type CSSProperties, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLayoutStore, type PanelId } from '@/stores/useLayoutStore';
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
      return { flex: '3 1 480px' };
    case 'flow':
      return { flex: '0 1 300px', minWidth: 260 };
    case 'news':
      return { flex: '2 1 380px' };
    case 'pnl':
      return { flex: '1 1 320px' };
  }
}

export function TerminalPage() {
  const order = useLayoutStore((s) => s.panelOrder);
  const maximized = useLayoutStore((s) => s.chartMaximized);
  const { movePanel, resetLayout } = useLayoutStore.getState();
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [over, setOver] = useState<PanelId | null>(null);

  return (
    <div className="terminal">
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
        <span className="label">Drag panels by title bar · F1–F5 switch modules · / focuses command line</span>
        <button className="btn ghost sm" onClick={resetLayout}>
          <RotateCcw size={12} /> Reset layout
        </button>
      </div>
    </div>
  );
}
