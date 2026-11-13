import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A menu anchored to a button, rendered into the button's own document (so it also works in a
 * popped-out window). Closes on an outside click or Esc; Esc is consumed so it doesn't also
 * restore a maximized window.
 */
export function PopMenu({ anchor, onClose, children, width = 200, align = 'left', testId }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; width?: number; align?: 'left' | 'right'; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const doc = anchor.ownerDocument;
  const view = doc.defaultView ?? window;
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const vw = view.innerWidth;
    const vh = view.innerHeight;
    const left = Math.max(8, Math.min(vw - width - 8, align === 'right' ? r.right - width : r.left));
    const below = vh - r.bottom - 12;
    const top = below >= 180 || below >= r.top ? r.bottom + 4 : Math.max(8, r.top - 4 - Math.min(r.top - 12, 420));
    setPos({ left, top, maxH: Math.max(160, top > r.top ? vh - top - 8 : r.top - 12) });
  }, [anchor, width, align, view]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    doc.addEventListener('pointerdown', down, true);
    view.addEventListener('keydown', key, true);
    return () => {
      doc.removeEventListener('pointerdown', down, true);
      view.removeEventListener('keydown', key, true);
    };
  }, [anchor, doc, view, onClose]);
  return createPortal(
    <div ref={ref} className="menu pop-menu" role="menu" style={{ position: 'fixed', width, left: pos?.left ?? -9999, top: pos?.top ?? -9999, maxHeight: pos?.maxH }} data-testid={testId}>
      {children}
    </div>,
    doc.body,
  );
}
