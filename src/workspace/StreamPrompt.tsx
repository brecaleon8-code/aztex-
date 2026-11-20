import type { ReactNode } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import { useWindow, useWindowSymbol } from './WindowContext';
import { contextOf, useLinkStore } from './useLinkStore';

/**
 * Book, tape and flow data stream for one symbol at a time: the active link context's. A window
 * showing another symbol renders this one-line prompt instead; clicking it switches the stream.
 */
export function Streamed({ children, testId }: { children: ReactNode; testId?: string }) {
  const symbol = useWindowSymbol();
  const selected = useMarketStore((s) => s.selected);
  const win = useWindow();
  if (symbol === selected) return <>{children}</>;
  return (
    <div className="win-empty" data-testid={testId}>
      <button className="btn sm" onClick={() => win && useLinkStore.getState().activate(contextOf(win))} data-testid="stream-symbol">
        Stream {symbol} here
      </button>
    </div>
  );
}
