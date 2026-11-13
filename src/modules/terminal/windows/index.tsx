import { Watchlist } from '../Watchlist';
import { OrderBook } from '../OrderBook';
import { OrderTicket } from '../OrderTicket';
import { Positions } from '../Positions';
import { Blotter } from '../Blotter';
import { TimeSales } from '../TimeSales';
import { OrderFlow } from '../OrderFlow';
import { PnlChart } from '../PnlChart';
import '../terminal.css';

export { ChartWindow } from './ChartWindow';

export const MonitorWindow = () => <Watchlist />;
export const OrderBookWindow = () => <OrderBook />;
export const TicketWindow = () => <OrderTicket />;
export const TapeWindow = () => <TimeSales />;
export const FlowWindow = () => <OrderFlow />;
export const PnlWindow = () => <PnlChart />;
export const BlotterWindow = () => (
  <>
    <Positions />
    <Blotter />
  </>
);
