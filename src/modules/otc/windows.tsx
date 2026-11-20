import { Desks, OtcBlotter, Rfq } from './OtcPage';
import { PanelChromeContext } from '@/components/ui/Panel';
import './otc.css';

/** OTC desk: request for quote beside the participating desks. */
export function OtcWindow() {
  return (
    <PanelChromeContext.Provider value="window-section">
      <div className="win-split otc-win">
        <Rfq />
        <Desks />
      </div>
    </PanelChromeContext.Provider>
  );
}

export { OtcBlotter };
