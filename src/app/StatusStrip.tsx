import { useEffect, useState } from 'react';
import { ShieldCheck, Zap } from 'lucide-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { fmtTime } from '@/lib/format';

function sessionLabel(utcHour: number): string {
  if (utcHour >= 13 && utcHour < 21) return utcHour < 16 ? 'London / New York overlap' : 'New York session';
  if (utcHour >= 7 && utcHour < 13) return 'London session';
  return 'Asia session';
}

export function StatusStrip() {
  const status = useMarketStore((s) => s.status);
  const providerId = useMarketStore((s) => s.providerId);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const live = status.state === 'open';
  return (
    <div className="status-strip no-select">
      <span className="row" style={{ gap: 6 }}>
        <span className={live ? 'live-dot' : 'live-dot off'} />
        <span className="dim">{live ? (providerId === 'live' ? 'Live pricing · Binance' : 'Live pricing · simulated') : status.state === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span>
      </span>
      <span className="sep" />
      <span className="row" style={{ gap: 5 }} title="Round-trip latency">
        <Zap size={12} className="faint" />
        <span className="num">{status.latencyMs == null ? '—' : `${status.latencyMs}ms`}</span>
      </span>
      <span className="sep" />
      <span className="num">{fmtTime(now)} UTC</span>
      <span className="sep" />
      <span className="dim">{sessionLabel(new Date(now).getUTCHours())}</span>
      <span className="spacer" />
      <span className="row" style={{ gap: 5 }}>
        <span className="fix-dot" />
        <span className="dim">FIX connected</span>
      </span>
      <span className="badge accent">
        <ShieldCheck size={11} /> Prime access
      </span>
    </div>
  );
}
