import { useEffect, useState } from 'react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { useMarketStore } from '@/stores/useMarketStore';
import { generateNews, type NewsItem } from '@/lib/mock/news';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtTime } from '@/lib/format';

const SYMBOLS = ASSET_UNIVERSE.map((a) => a.symbol);

/** Headline wire (mock). Production: a licensed news/alt-data feed pushed over a socket. */
export function News({ drag }: { drag?: PanelDragProps }) {
  const select = useMarketStore((s) => s.select);
  const selected = useMarketStore((s) => s.selected);
  const [onlySel, setOnlySel] = useState(false);
  const [items, setItems] = useState<NewsItem[]>(() => Array.from({ length: 12 }, (_, i) => generateNews(SYMBOLS, Math.random, Date.now() - (12 - i) * 95_000)).reverse());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      setItems((xs) => [generateNews(SYMBOLS), ...xs].slice(0, 60));
      t = setTimeout(loop, 6000 + Math.random() * 9000);
    };
    t = setTimeout(loop, 5000);
    return () => clearTimeout(t);
  }, []);
  const shown = onlySel ? items.filter((n) => n.symbol === selected) : items;
  return (
    <Panel
      code="TOP"
      title="News"
      sub="wire"
      drag={drag}
      flush
      testId="news"
      actions={
        <button className={`btn sm ${onlySel ? 'active' : ''}`} onClick={() => setOnlySel((v) => !v)} aria-pressed={onlySel}>
          {selected} ONLY
        </button>
      }
    >
      <div className="news">
        {shown.map((n) => (
          <button key={n.id} className={`news-row ${n.urgent ? 'urgent' : ''}`} onClick={() => n.symbol && select(n.symbol)}>
            <span className="num faint">{fmtTime(n.time, false)}</span>
            <span className="news-src mono">{n.source}</span>
            <span className="news-hl">{n.urgent && <span className="news-flag">*</span>}{n.headline}</span>
          </button>
        ))}
        {shown.length === 0 && <div className="empty">NO STORIES FOR {selected}</div>}
      </div>
    </Panel>
  );
}
