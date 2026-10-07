import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './modal.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: number;
  testId?: string;
}

/** Accessible dialog: portal, scrim click / Esc to close, focus moved in and restored on close. */
export function Modal({ open, onClose, title, subtitle, children, width = 760, testId }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], input, button')?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-scrim" onMouseDown={onClose}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={{ width }} onMouseDown={(e) => e.stopPropagation()} data-testid={testId}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
