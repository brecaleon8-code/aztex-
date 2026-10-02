import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { useToastStore } from '@/stores/useToastStore';
import './toasts.css';

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} data-testid="toast">
          {t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <XCircle size={16} /> : <Info size={16} />}
          <div className="grow">
            <div className="toast-title">{t.title}</div>
            {t.detail && <div className="toast-detail mono">{t.detail}</div>}
          </div>
          <button className="btn ghost sm icon" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
