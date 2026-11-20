import { OrderBook } from '../OrderBook';
import { OrderTicket } from '../OrderTicket';
import { TimeSales } from '../TimeSales';
import { OrderFlow } from '../OrderFlow';
import { PnlChart } from '../PnlChart';
import { useWindowSymbol } from '@/workspace/WindowContext';
import { Streamed } from '@/workspace/StreamPrompt';
import '../terminal.css';
import './windows.css';

export { ChartWindow } from './ChartWindow';
export { MonitorWindow } from './MonitorWindow';
export { QuoteWindow } from './QuoteWindow';
export { BlotterWindow } from './BlotterWindow';

export function TicketWindow() {
  return <OrderTicket symbol={useWindowSymbol()} />;
}
export const OrderBookWindow = () => <OrderBook />;
export const TapeWindow = () => (
  <Streamed testId="tape">
    <TimeSales />
  </Streamed>
);
export const FlowWindow = () => (
  <Streamed testId="flow">
    <OrderFlow />
  </Streamed>
);
export const PnlWindow = () => <PnlChart />;
