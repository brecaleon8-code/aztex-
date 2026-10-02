import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { CLI_HELP, parseCli } from '@/lib/trading/cli';
import { suggestedLevels } from '@/lib/trading/pnl';
import { fmtPrice, fmtQty } from '@/lib/format';
import { useMarketStore } from '@/stores/useMarketStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { usePositionStore } from '@/stores/usePositionStore';
import { flattenAll, placeOrder } from '@/stores/trading';

export interface CliResult {
  ok: boolean;
  text: string;
}

const SYMBOLS = ASSET_UNIVERSE.map((a) => a.symbol);

/** Executes a CLI line against real app state. */
export function execCli(line: string): CliResult {
  const parsed = parseCli(line, SYMBOLS);
  if (!parsed.ok) return { ok: false, text: parsed.error };
  const cmd = parsed.cmd;
  const market = useMarketStore.getState();
  switch (cmd.kind) {
    case 'help':
      return { ok: true, text: CLI_HELP };
    case 'jump':
      market.select(cmd.symbol);
      return { ok: true, text: `Chart → ${cmd.symbol}/USDT` };
    case 'watch':
      market.addWatch(cmd.symbol);
      return { ok: true, text: `${cmd.symbol} added to watchlist` };
    case 'unwatch':
      market.removeWatch(cmd.symbol);
      return { ok: true, text: `${cmd.symbol} removed from watchlist` };
    case 'theme':
      useThemeStore.getState().setTheme(cmd.theme);
      return { ok: true, text: `Theme set to ${cmd.theme}` };
    case 'flatten': {
      const n = usePositionStore.getState().positions.length;
      if (n === 0) return { ok: false, text: 'No open positions' };
      void flattenAll();
      return { ok: true, text: `Flattening ${n} position${n > 1 ? 's' : ''}` };
    }
    case 'order': {
      const side = cmd.side === 'buy' ? 'Long' : 'Short';
      const a = market.assets[cmd.symbol];
      const entry = side === 'Long' ? a.ask : a.bid;
      const { tp, sl } = suggestedLevels(side, entry);
      market.select(cmd.symbol);
      const r = placeOrder({ symbol: cmd.symbol, side, orderType: 'market', size: cmd.amount, tp, sl });
      return r.ok ? { ok: true, text: `${cmd.side.toUpperCase()} ${fmtQty(cmd.amount)} ${cmd.symbol} @ ${fmtPrice(entry)}` } : { ok: false, text: r.error };
    }
  }
}
