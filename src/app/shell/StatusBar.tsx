import { useEffect, useState } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import { fmtTime } from '@/lib/format';
import { GasTicker } from '../GasTicker';

function sessionLabel(h: number): string {
  if (h >= 13 && h < 21) return h < 16 ? 'London / NY' : 'New York';
  if (h >= 7 && h < 13) return 'London';
  return 'Asia';
}

/** One 24px row: feed and latency, order routing, UTC clock and session, network fees. */
export function StatusBar() {
  const status = useMarketStore((s) => s.status);
  const providerId = useMarketStore((s) => s.providerId);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const live = status.state === 'open';
  return (
    <footer className="status-bar no-select" data-testid="status-bar">
      <span className="sb-cell" title={status.detail}>
        <span className={live ? 'live-dot' : 'live-dot off'} />
        <span className="dim">{live ? (providerId === 'live' ? 'Binance live' : 'Simulated feed') : status.state === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span>
        <span className="num faint">{status.latencyMs == null ? '' : `${status.latencyMs}ms`}</span>
      </span>
      <span className="sb-cell" title="Orders fill against the simulated matching engine (paper trading)">
        <span className="live-dot" />
        <span className="dim">Orders · paper</span>
      </span>
      <span className="sb-cell">
        <span className="num">{fmtTime(now)} UTC</span>
        <span className="dim">{sessionLabel(new Date(now).getUTCHours())}</span>
      </span>
      <span className="spacer" />
      <GasTicker />
    </footer>
  );
}
