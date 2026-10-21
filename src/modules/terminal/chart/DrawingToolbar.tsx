import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, TrendingUp, Minus, AlignJustify, Square, Brush, Type, Ruler, ZoomIn, Magnet, Lock, LockOpen, Eye, EyeOff, Trash2, Undo2, type LucideIcon } from 'lucide-react';
import { useChartStore } from '@/stores/useChartStore';
import type { DrawingTool } from '@/types';

const TOOLS: { tool: DrawingTool; icon: LucideIcon; label: string; key?: string }[] = [
  { tool: 'cursor', icon: Crosshair, label: 'Cross · pan, select and move drawings', key: 'Esc' },
  { tool: 'trend', icon: TrendingUp, label: 'Trend line', key: 'Alt+T' },
  { tool: 'ray', icon: Minus, label: 'Horizontal line', key: 'Alt+H' },
  { tool: 'fib', icon: AlignJustify, label: 'Fib retracement', key: 'Alt+F' },
  { tool: 'rect', icon: Square, label: 'Rectangle' },
  { tool: 'brush', icon: Brush, label: 'Brush' },
  { tool: 'text', icon: Type, label: 'Text' },
];
const GESTURES: { tool: DrawingTool; icon: LucideIcon; label: string }[] = [
  { tool: 'measure', icon: Ruler, label: 'Measure · price, % and time' },
  { tool: 'zoom', icon: ZoomIn, label: 'Zoom tool · drag across bars' },
];

/**
 * TradingView-style drawing toolbar down the left edge of the chart: tools, measure/zoom, then
 * magnet, lock and hide toggles, undo and remove.
 */
export function DrawingToolbar() {
  const { tool, setTool, magnet, toggleMagnet, drawingsLocked, toggleDrawingsLocked, drawingsHidden, toggleDrawingsHidden, drawings, drawingUndo, undoDrawings } = useChartStore();
  const btn = (t: DrawingTool, Icon: LucideIcon, label: string, key?: string) => (
    <button key={t} className={`dt-btn ${tool === t ? 'on' : ''}`} onClick={() => setTool(t)} aria-label={label} aria-pressed={tool === t} title={key ? `${label} (${key})` : label} data-testid={`tool-${t}`}>
      <Icon size={16} strokeWidth={1.6} />
    </button>
  );
  return (
    <div className="draw-toolbar no-select" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical" data-testid="drawing-toolbar">
      {TOOLS.map((t) => btn(t.tool, t.icon, t.label, t.key))}
      <span className="dt-sep" />
      {GESTURES.map((t) => btn(t.tool, t.icon, t.label))}
      <span className="dt-sep" />
      <button className={`dt-btn ${magnet ? 'on' : ''}`} onClick={toggleMagnet} aria-pressed={magnet} aria-label="Magnet mode: snap to open, high, low, close" title="Magnet: snap points to OHLC" data-testid="toggle-magnet">
        <Magnet size={16} strokeWidth={1.6} />
      </button>
      <button className={`dt-btn ${drawingsLocked ? 'on' : ''}`} onClick={toggleDrawingsLocked} aria-pressed={drawingsLocked} aria-label={drawingsLocked ? 'Unlock drawings' : 'Lock all drawings'} title={drawingsLocked ? 'Unlock drawings' : 'Lock all drawings (no moving or deleting)'} data-testid="toggle-lock">
        {drawingsLocked ? <Lock size={16} strokeWidth={1.6} /> : <LockOpen size={16} strokeWidth={1.6} />}
      </button>
      <button className={`dt-btn ${drawingsHidden ? 'on' : ''}`} onClick={toggleDrawingsHidden} aria-pressed={drawingsHidden} aria-label={drawingsHidden ? 'Show drawings' : 'Hide all drawings'} title={drawingsHidden ? 'Show drawings' : 'Hide all drawings'} data-testid="toggle-hide">
        {drawingsHidden ? <EyeOff size={16} strokeWidth={1.6} /> : <Eye size={16} strokeWidth={1.6} />}
      </button>
      <span className="dt-sep" />
      <button className="dt-btn" onClick={() => undoDrawings()} disabled={drawingUndo.length === 0} aria-label="Undo drawing" title="Undo (Ctrl+Z)" data-testid="undo-drawing">
        <Undo2 size={16} strokeWidth={1.6} />
      </button>
      <RemoveMenu count={drawings.length} locked={drawingsLocked} />
    </div>
  );
}

/** Trash: remove drawings, indicators, or both (a small flyout, like TradingView). */
function RemoveMenu({ count, locked }: { count: number; locked: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const indicators = useChartStore((s) => s.indicators.length);
  useEffect(() => {
    if (!at) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAt(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [at]);
  const run = (fn: () => void) => {
    fn();
    setAt(null);
  };
  const s = useChartStore.getState;
  return (
    <>
      <button
        className="dt-btn"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: r.right + 6, y: r.top });
        }}
        aria-label="Remove drawings and indicators"
        title="Remove…"
        data-testid="remove-drawings"
      >
        <Trash2 size={16} strokeWidth={1.6} />
      </button>
      {at &&
        createPortal(
          <div ref={ref} className="menu dt-flyout" style={{ position: 'fixed', left: at.x, top: Math.min(at.y, window.innerHeight - 130) }} role="menu">
            <button className="menu-item" disabled={!count || locked} onClick={() => run(() => s().clearDrawings())} data-testid="remove-all-drawings" title={locked ? 'Drawings are locked' : undefined}>
              <span className="grow">Remove {count} drawing{count === 1 ? '' : 's'}</span>
            </button>
            <button className="menu-item" disabled={!indicators} onClick={() => run(() => s().indicators.forEach((i) => s().removeIndicator(i.id)))} data-testid="remove-all-indicators">
              <span className="grow">Remove {indicators} indicator{indicators === 1 ? '' : 's'}</span>
            </button>
            <button
              className="menu-item"
              disabled={(!count || locked) && !indicators}
              onClick={() =>
                run(() => {
                  if (!locked) s().clearDrawings();
                  s().indicators.forEach((i) => s().removeIndicator(i.id));
                })
              }
            >
              <span className="grow">Remove drawings &amp; indicators</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
