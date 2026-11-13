import { Desks, OtcBlotter, Rfq } from './OtcPage';
import './otc.css';

/** OTC desk: request for quote beside the participating desks. */
export function OtcWindow() {
  return (
    <div className="win-split otc-win">
      <Rfq />
      <Desks />
    </div>
  );
}

export { OtcBlotter };
