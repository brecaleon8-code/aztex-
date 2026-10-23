import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Calendar, Feed, useNow } from '@/app/NewsDock';
import { MHeader } from '../MobileApp';
import '@/app/news-dock.css';

/** Headlines and the economic calendar, full screen. */
export function NewsScreen() {
  const [tab, setTab] = useState<'feed' | 'calendar'>('feed');
  const now = useNow(1000);
  return (
    <div className="m-page">
      <MHeader title="News" back="/menu" />
      <div className="m-filters">
        <Segmented
          full
          value={tab}
          onChange={setTab}
          ariaLabel="News view"
          options={[
            { value: 'feed', label: 'Headlines' },
            { value: 'calendar', label: 'Calendar' },
          ]}
        />
      </div>
      <div className="m-news news-dock">{tab === 'feed' ? <Feed now={now} /> : <Calendar now={now} />}</div>
    </div>
  );
}
