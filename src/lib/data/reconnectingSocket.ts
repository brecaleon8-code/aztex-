/** WebSocket with exponential backoff + jitter reconnect. */
export interface ReconnectingSocketOptions {
  url: string;
  onMessage: (data: unknown) => void;
  onState?: (state: 'connecting' | 'open' | 'reconnecting' | 'closed', detail?: string) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function backoffDelay(attempt: number, base = 500, max = 15_000, rand = Math.random): number {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(exp / 2 + rand() * (exp / 2)); // "equal jitter"
}

export class ReconnectingSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private opts: ReconnectingSocketOptions) {
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    this.opts.onState?.(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.opts.onState?.('open');
    };
    ws.onmessage = (ev) => {
      try {
        this.opts.onMessage(JSON.parse(String(ev.data)));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (ev) => {
      if (this.closed) return;
      const delay = backoffDelay(this.attempt++, this.opts.baseDelayMs, this.opts.maxDelayMs);
      this.opts.onState?.('reconnecting', `closed (${ev.code}); retry in ${Math.round(delay / 100) / 10}s`);
      this.timer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.opts.onState?.('closed');
  }
}
