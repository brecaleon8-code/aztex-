import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Phone bottom sheet: slides up over a dimmed backdrop; tap outside, the ×, Esc or a downward swipe
 * on the grab handle closes it. Rendered inside the phone app (not portaled), so the desktop phone
 * preview keeps it inside the frame.
 */
export function BottomSheet({ title, sub, onClose, children, footer, testId, tall }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; testId?: string; tall?: boolean }) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  // Close on a tap that starts on the backdrop: the lift of the press that opened the sheet (a
  // long-press on a quote) lands there too and must not close it straight away.
  const downOnBackdrop = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const grab = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      start.current = e.clientY;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current != null) setDy(Math.max(0, e.clientY - start.current));
    },
    onPointerUp: () => {
      if (dy > 90) onClose();
      start.current = null;
      setDy(0);
    },
    onPointerCancel: () => {
      start.current = null;
      setDy(0);
    },
  };
  return (
    <div className="m-sheet-layer" role="presentation">
      <div
        className="m-backdrop"
        onPointerDown={() => (downOnBackdrop.current = true)}
        onClick={() => {
          if (downOnBackdrop.current) onClose();
          downOnBackdrop.current = false;
        }}
      />
      <section className={`m-sheet ${tall ? 'tall' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined} data-testid={testId}>
        <div className="m-sheet-grab" {...grab}>
          <span />
        </div>
        <header className="m-sheet-head" {...grab}>
          <div className="grow">
            <div className="m-sheet-title">{title}</div>
            {sub && <div className="m-sheet-sub">{sub}</div>}
          </div>
          <button className="m-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="m-sheet-body">{children}</div>
        {footer && <footer className="m-sheet-foot">{footer}</footer>}
      </section>
    </div>
  );
}
