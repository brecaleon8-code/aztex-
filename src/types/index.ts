// Core domain shapes (spec §9). Kept framework-free so lib/ and stores/ share them.

export interface AssetMeta {
  symbol: string;
  name: string;
  /** Circulating supply, used for mock market-cap / dominance. */
  supply: number;
  /** Network(s) the asset lives on, for the blockchain scanner. */
  networks: string[];
}

export interface Asset {
  symbol: string;
  name: string;
  price: number;
  change24h: number; // percent
  bid: number; // derived: price - spread/2
  ask: number; // derived: price + spread/2
  volume24h: number; // quote (USD) volume
}

export interface Ticker {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  change24h: number;
  volume24h: number;
  time: number;
}

export interface Candle {
  time: number; // unix ms (open time)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A single print on the tape. `side` is the aggressor (taker) side. */
export interface Trade {
  id: string;
  symbol: string;
  price: number;
  size: number; // base qty
  side: 'buy' | 'sell';
  time: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface OrderBookLevel {
  price: number;
  size: number;
  cumulative: number;
}
export interface OrderBookSnapshot {
  bids: OrderBookLevel[]; // best (highest) first
  asks: OrderBookLevel[]; // best (lowest) first
  time: number;
}

export type Side = 'Long' | 'Short';
export type OrderType = 'market' | 'limit';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK';
export type OrderStatus = 'new' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
export type OrderKind = 'market' | 'limit' | 'take_profit' | 'stop_loss' | 'twap' | 'close';

/** Every order the account sends, with its lifecycle and execution quality (the blotter). */
export interface OrderRecord {
  id: string;
  symbol: string;
  side: Side;
  kind: OrderKind;
  qty: number;
  filledQty: number;
  avgPx: number | null;
  limitPrice?: number;
  triggerPrice?: number;
  tif: TimeInForce;
  postOnly: boolean;
  reduceOnly: boolean;
  bracket: boolean;
  parentId?: string;
  positionId?: string;
  status: OrderStatus;
  reason?: string;
  /** Mid price when the order was sent — the benchmark for slippage. */
  arrivalMid: number;
  fees: number;
  createdAt: number;
  updatedAt: number;
  source: 'ticket' | 'cli' | 'book' | 'algo' | 'bracket' | 'close';
}

export interface FillRecord {
  id: string;
  orderId: string;
  symbol: string;
  side: Side;
  price: number;
  qty: number;
  fee: number;
  liquidity: 'maker' | 'taker';
  time: number;
  /** Priced beyond the visible book (model estimate). */
  estimated: boolean;
}

export interface Position {
  id: string;
  symbol: string;
  side: Side;
  size: number; // base-asset quantity
  entry: number;
  current: number;
  tp: number;
  sl: number;
  pnl: number; // unrealized, USDT
  tpHit: boolean;
  slHit: boolean;
  orderType: OrderType;
  openedAt: number;
  /** TP/SL are live OCO exit orders (bracket) rather than alert levels. */
  bracket?: boolean;
  /** Entry order that opened it. */
  orderId?: string;
}

export interface WorkingOrder {
  id: string;
  symbol: string;
  side: Side;
  size: number;
  limitPrice: number;
  tp: number;
  sl: number;
  createdAt: number;
  postOnly?: boolean;
  reduceOnly?: boolean;
  bracket?: boolean;
  /** Fill into this position (the rest of a partially filled GTC order). */
  positionId?: string;
}

/** A running execution algorithm (parent order). */
export interface AlgoOrder {
  id: string;
  kind: 'TWAP';
  symbol: string;
  side: Side;
  totalSize: number;
  slices: number;
  slicesDone: number;
  intervalMs: number;
  filledSize: number;
  avgPx: number;
  arrivalPx: number;
  tp: number;
  sl: number;
  positionId: string | null;
  status: 'running' | 'done' | 'cancelled';
  startedAt: number;
}

export type DrawingTool = 'cursor' | 'trend' | 'ray' | 'rect' | 'fib' | 'text';
export interface DataPoint {
  index: number;
  price: number;
}
export interface Drawing {
  id: string;
  tool: Exclude<DrawingTool, 'cursor'>;
  p1: DataPoint;
  p2?: DataPoint;
  text?: string;
}

export type IndicatorKind = 'sma' | 'ema' | 'bollinger' | 'rsi' | 'macd' | 'volume' | 'vwap' | 'cvd' | 'custom' | 'script';
export interface IndicatorInstance {
  id: string;
  kind: IndicatorKind;
  type: 'overlay' | 'oscillator';
  color: string;
  period?: number;
  mult?: number; // bollinger
  fast?: number; // macd
  slow?: number;
  signal?: number;
  name?: string; // custom
  formula?: string; // for kind === 'custom'
  script?: string; // for kind === 'script' — JavaScript run in the QuickJS/WASM sandbox
  inputs?: Record<string, number>; // script input overrides
}

export type ChartMode = 'candles' | 'heikin' | 'bars' | 'line' | 'area' | 'renko' | 'footprint';

export interface AppearanceColors {
  bull: string;
  bear: string;
  profit: string;
  loss: string;
}

/** A trade setup shared in chat / forum. */
export interface TradeChipData {
  symbol: string;
  side: Side;
  entry: number;
  tp?: number;
  sl?: number;
}

export type ScannerEventType = 'large_transfer' | 'exchange_inflow' | 'exchange_outflow' | 'whale_move';
export interface ScannerEvent {
  id: string;
  symbol: string;
  network: string;
  type: ScannerEventType;
  amount: number; // native units
  usd: number;
  from: string;
  to: string;
  time: number;
  flagged: boolean;
  txHash: string;
}

export interface OtcQuote {
  id: string;
  desk: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  total: number;
  createdAt: number;
  expiresAt: number;
}

export interface OtcFill extends OtcQuote {
  executedAt: number;
}
