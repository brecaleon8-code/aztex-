# Aztex

A professional, multi-module crypto trading terminal: **Terminal**, **Data & Discovery**, **Community**, **OTC Desk** and **Appearance**. It is built from the *Aztex — Build Spec for Claude Code* as a production-structured React + TypeScript app. All market data is mocked by default, and a `MarketDataProvider` seam lets you swap in live data without touching UI code.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + component tests (Vitest)
npm run test:e2e     # Playwright acceptance tests (builds + previews the app)
npm run build        # typecheck + production build
```

Set `VITE_MARKET_DATA=live` (see `.env.example`) to start on Binance public market data. You can also switch at runtime under **Appearance → Market data source**. Live mode needs no API keys. If your Chromium is preinstalled somewhere else, point Playwright at it with `PW_CHROMIUM_PATH=/path/to/chrome`.

## Stack

| Concern | Choice |
| --- | --- |
| Build / framework | Vite + React 18 + TypeScript (strict), React Router |
| State | Zustand domain stores: `useThemeStore`, `useMarketStore`, `useOrderStore`, `usePositionStore`, `useWalletStore`, `useLayoutStore`, plus `useChartStore`, `useDiscoveryStore`, `useCommunityStore`, `useOtcStore`, `useToastStore`. User preferences persist to `localStorage`. |
| Price chart | Hand-rolled SVG (see "Charting decision" below) |
| Simple charts | `recharts` (P/L mountain, dominance ring, comparison lines) |
| Icons | `lucide-react` |
| Styling | Plain CSS with custom-property theming (`[data-theme]` on `<html>`), so a theme switch never re-renders components |
| Fonts | Fraunces (display, variable `opsz`), Inter (UI), JetBrains Mono (all numbers), self-hosted via Fontsource |
| Tests | Vitest + Testing Library (unit/component), Playwright (acceptance) |

## Layout

```
src/
  app/            App shell, routing, sidebar, status strip, gas ticker, market/scanner feed wiring
  modules/
    terminal/     watchlist, chart/ (PriceChart, toolbar, indicator menu), order book, ticket, positions, P/L, CLI
    discovery/    currency search, market share, comparison chart, blockchain scanner + alerts
    community/    identity (X handle, friend code), contacts, chat with trade chips, forum
    otc/          RFQ with countdown, desks, blotter
    appearance/   candle/P&L palette, theme, data-source switch
  components/ui/  Panel, Segmented, NumericField, Toasts
  lib/
    indicators/   sma, ema, bollinger, rsi (Wilder), macd, formula tokenizer/parser/evaluator, compute
    chart/        heikin-ashi, viewport (zoom + pixel-accumulator pan), scales, fib, flag paths
    trading/      P/L math, TP/SL suggestions, position sizing, CLI grammar
    mock/         every mock generator, isolated (assets, candles, order book, scanner, OTC, gas, community)
    data/         MarketDataProvider interface, MockProvider, LiveProvider (Binance), reconnecting socket, batcher
  stores/         Zustand stores + cross-store trading actions (place/close/flatten/fills)
  types/          domain types (§9)
```

## How the spec maps to code

- **Theming (§3).** `styles/tokens.css` defines both palettes with the exact hex values. Light mode has its own near-invisible `--shadow`. P/L colors are literal hex in the Appearance store and are mirrored to `--bull/--bear/--profit/--loss`. The categorical palette is fixed in `useThemeStore.CATEGORICAL`.
- **Terminal (§4).**
  - Panels can be dragged by their header and reflow via flexbox `order`. The order persists, and there's a "Reset layout" button.
  - Clicking an order-book row sets the ticket's limit price and switches the ticket to Limit.
  - TP/SL use `NumericField`, which only ever commits finite numbers. "Reset to suggested" applies ±3.2% / ±1.6%.
  - Placing an order goes through three stages: about 450 ms placing, 1.4 s placed, then a toast.
  - Closing a position fades and shrinks the row, then settles the result into the wallet.
  - Limit orders that can't fill immediately rest as working orders and fill when price crosses them.
  - The CLI bar is an App-level overlay. It stays phosphor-green on near-black in both themes.
- **Chart (§5).**
  - The SVG is sized to the measured pixel box with a `ResizeObserver`; there is no stretched `viewBox`.
  - Five render modes, including a proper Heikin-Ashi calculation.
  - Viewport is `{visibleCount, viewEnd}` over a history of 320 or more candles. Indicators are computed on the full real-OHLC series and then windowed.
  - Zoom works with the wheel or the +/− buttons (×0.83 / ×1.2, clamped). Pan uses a pixel accumulator. A "Jump to live" pill appears when you're viewing history. The chart height is resizable, and the chart can be maximized.
  - `user-select: none` is set on the chart and on draggable headers.
  - Other features:
    - crosshair with axis tags
    - OHLCV readout
    - flag-shaped Entry/TP/SL tags; a live position's levels take priority over the ticket's draft levels
    - oscillator panes
    - safe formula language
    - drawing tools anchored to (index, price), cleared when you switch symbols
- **Discovery (§6).** Search highlights and scrolls to the matching asset. Selection is shared between the dominance ring and the table. Up to 5 assets can be compared as normalized % lines. The scanner has a live feed, a Track toggle, flagged rows and a persisted alert builder.
- **Community (§7).**
  - You can link and unlink an X handle (with a verified badge). Each user gets a friend code with copy-to-clipboard, and contacts can only be added by code.
  - The chat can carry trade-chip messages, and the mock counterparties reply with their own setups.
  - The forum supports posts with live P/L trade chips, likes, comment counts and sharing.
- **OTC & Appearance (§8).** Quotes count down for 15 s, and Accept is disabled once a quote expires. Accepted quotes land in a blotter. The Appearance page has four color pickers, a live preview and a reset button.
- **Data seam (§9).** UI code depends only on `MarketDataProvider`. `MockProvider` drives the simulated market. `LiveProvider` implements the same interface against Binance's public market-data endpoints:
  - REST klines for history
  - combined WebSocket streams for `@ticker`, `@kline_<tf>` and `@depth20@100ms`
  - exponential-backoff reconnect
  - render-rate batching (tickers about 4 Hz, candles about 15 Hz, book about 10 Hz)

  Symbol mapping such as MATIC→POL is isolated in the provider.

## Charting decision

The spec suggests comparing a hand-rolled renderer with TradingView's `lightweight-charts`. This build keeps the **hand-rolled SVG**:

- The custom formula overlays, oscillator panes, data-anchored drawing tools, flag-shaped level tags and the accumulator pan are all first-class here.
- With `lightweight-charts`, most of those would need custom primitives bolted on.

The renderer is split so a swap stays contained. The pure math lives in `lib/chart` and is unit-tested, and the rendering is isolated in `modules/terminal/chart/PriceChart.tsx`. If profiling shows SVG node counts becoming a problem (very large `visibleCount`), the next step is to move candle bodies to a `<canvas>` layer and keep overlays in SVG.

## Status by phase

| Phase | Status |
| --- | --- |
| 1. Core Terminal (mock) | Done. Acceptance is covered by `e2e/acceptance.spec.ts`. |
| 2. Data & Discovery | Done. Alert rules persist to `localStorage`. |
| 3. Community | Done, client-side mock (no backend). |
| 4. OTC + Appearance | Done. Expiry is tested with Playwright's clock. |
| 5. Real data | `LiveProvider` (Binance) is implemented and unit-tested against a fake WebSocket and fetch. It has **not** been run against the live venue from the build environment, whose network policy blocks Binance. Verify it locally with `VITE_MARKET_DATA=live npm run dev`. |

### Known limitations / next steps

- **Order book depth.** The live order book uses Binance's partial-depth snapshots (top 20). A full L2 diff stream with local book maintenance is the next step if deeper books are needed. The UI contract (snapshots) stays the same either way.
- **Mock-only areas.** Wallet, OTC quotes, the scanner, dominance and community are mocks behind clear seams (`lib/mock/*`, `app/scannerFeed.ts`). Each needs its own backend, as §6–§9 describe. **Wallet and custody must get a dedicated security review. Nothing in the mock wallet is safe for real funds.**
- **Fills.** Positions are spot-like at 1×: opening a position reserves its full notional. The mock fills market orders at the bid or ask with no slippage model.
