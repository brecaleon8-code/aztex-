import { useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { TradeChipData } from '@/types';
import { usePositionStore } from '@/stores/usePositionStore';
import { useTicket } from '../terminal/useTicket';
import { fmtPrice } from '@/lib/format';

/** Picker for attaching a trade chip: any open position, or the current ticket draft. */
export function AttachTrade({ value, onChange }: { value?: TradeChipData; onChange: (t?: TradeChipData) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const positions = usePositionStore((s) => s.positions);
  const t = useTicket();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options: { key: string; label: string; trade: TradeChipData }[] = [
    ...positions.map((p) => ({ key: p.id, label: `Position · ${p.side} ${p.symbol} @ ${fmtPrice(p.entry)}`, trade: { symbol: p.symbol, side: p.side, entry: p.entry, tp: p.tp, sl: p.sl } })),
    { key: 'draft', label: `Ticket draft · ${t.side} ${t.symbol} @ ${fmtPrice(t.entry)}`, trade: { symbol: t.symbol, side: t.side, entry: t.entry, tp: t.tp, sl: t.sl } },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className={`btn sm ${value ? 'active' : 'ghost'}`} onClick={() => (value ? onChange(undefined) : setOpen((o) => !o))} data-testid="attach-trade">
        <Paperclip size={12} /> {value ? `${value.side} ${value.symbol} · remove` : 'Attach trade'}
      </button>
      {open && (
        <div className="menu" style={{ bottom: 30, left: 0, width: 300 }}>
          {options.map((o) => (
            <button
              key={o.key}
              className="menu-item"
              onClick={() => {
                onChange(o.trade);
                setOpen(false);
              }}
            >
              <span className="mono" style={{ fontSize: 11.5 }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
