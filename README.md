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
| Styling | Plain CSS with custom-property theming (`[data-theme]` on `<html>`). "Graphite" visual language: a neutral grayish-black interface where royal green appears only as a deliberate hint (brand mark, active nav/workspace indicators, primary actions, focus rings, selected-row edge, chart entry flag and POC). Bright mint/red stay reserved for P/L direction, and one warm tone marks warnings. Modest 6–8px radii, quiet panel chrome. "Silver" is the separately tuned light theme. |
| Fonts | Inter (UI) and IBM Plex Mono (all numbers), self-hosted via Fontsource |
| Tests | Vitest + Testing Library (unit/component), Playwright (acceptance) |

## Fees, partner codes, deposits & Studio

**Fees.** Every fill is charged per tier (`lib/account/fees.ts`):

| Tier | Maker | Taker |
| --- | --- | --- |
| Standard | 0.020% | 0.060% |
| Partner | 0.010% | 0.040% |
| Liquidity Provider | −0.005% (rebate) | 0.030% |

Market and marketable orders, closes, flattens and TWAP slices pay taker; resting limit orders that later fill pay maker. The ticket shows the estimated fee, toasts show the fee or rebate charged, and the Account page tracks fees paid and rebates earned.

**Partner / LP codes** (`lib/account/partnerCodes.ts`, Account page).
- **Format:** `LP-XXXX-XXXX` or `PT-XXXX-XXXX`. An unambiguous alphabet plus a check character means typos are rejected before any lookup.
- **Rules:** each account can redeem a code once, and codes support max uses, expiry and revocation. Revoking the code an account is on returns it to Standard.
- **Issuing:** the "Partner codes" console issues codes.
- **Demo codes:** two codes are pre-seeded so the flow can be tried immediately.
- **⚠ Production:** issuance and redemption must move server-side (signed, permissioned, rate-limited, audited). In this build they run client-side against a mock registry for demonstration only — a client must never be able to grant itself a tier.

**Add crypto** (`app/DepositModal.tsx`, `lib/account/deposit.ts`). The flow goes coin → network → address:
- **Shown for each network:** a QR code, a required memo or destination tag where the network needs one (XRP, ATOM), the minimum deposit, confirmations needed and arrival time, and wrong-network warnings.
- **Supported coins:** USDT and USDC on several networks, plus every listed coin.
- **Crediting:** arrived USDT goes to the trading balance; other coins go to holdings, valued live and convertible to USDT on the Account page.
- **⚠ Addresses are simulated** (derived, not keys) and labelled as such in the UI. Production replaces `depositAddress()` with the custody provider's per-account address API.

**Studio** (`modules/studio`).
- **Indicator library:** save named formulas with a live preview, then add them to the chart (they also appear under "My indicators" in the chart's indicator menu).
- **Strategy builder:** entry and exit rules, direction, TP/SL %, and starter templates.
- **Backtests:** run instantly on the selected symbol and timeframe and report net return vs buy & hold, win rate, profit factor, max drawdown, exposure, an equity curve and a trade list.
- **Show on chart:** plots entry and exit markers on the Terminal chart.
- **Execution model (no look-ahead):** signals fill at the next bar's open; the stop is checked before the target within a bar; fees are charged on both sides.
- **Formula language** additions: comparisons, `and`/`or`/`not`, and `rsi`, `highest`, `lowest`, `prev`, `cross_over`, `cross_under`, `abs`, `min`, `max`.

## News & calendar dock

Open it with the **News** button in the top bar, **Alt+N**, or the command palette. You can pin it to the **left or right** edge, and it stays there on every page and across reloads.

- **Headlines tab.** A live wire covering crypto, macro, regulation, on-chain and markets news.
  - **Filtering:** pick categories with the chips, set a minimum impact, or tick **My assets**. My assets keeps stories about your selected symbol, watchlist and open positions, plus high-impact macro news.
  - **Reading:** click a headline for its summary, or click a symbol tag (▲/▼ shows sentiment) to open that symbol on the chart.
  - **Scrolling:** while you're scrolled down, new stories wait behind a "N new" pill, so nothing shifts under your cursor.
- **Calendar tab.** An economic and crypto calendar for yesterday through the next six days, in UTC.
  - Economic events include CPI, NFP, Fed/ECB/BoE/BoJ decisions and PMIs. Crypto events include options expiries, token unlocks, upgrades and ETF deadlines.
  - Each event shows impact bars, actual, forecast and previous values, and a countdown for anything in the next 24 hours. A "now" line marks the current time.
  - When an event prints, the actual value is coloured **beat/miss** against the forecast (lower-is-better series such as CPI and unemployment are handled). The print also posts to the wire.
- **Always on.** A "Next high impact" strip with a countdown sits at the top. High-impact events raise a toast 5 minutes before release and again when they print; the bell icon mutes these.
- **Layout.** The dock is resizable (drag its inner edge; double-click resets the width). It collapses to a slim rail that still shows the unread count and the next-event countdown. On narrow screens and on the Mobile platform it floats over the page instead.

**Data.** The wire and calendar are **simulated** (`src/lib/news/mockNews.ts`). A demo high-impact release is scheduled a few minutes after load so you can watch one print. The source sits behind a `NewsProvider` interface (`src/lib/news/types.ts`), so a production adapter can plug in a licensed headline socket and an economic-calendar API without UI changes. Feed wiring and alerts live in `src/app/newsFeed.ts`, the UI in `src/app/NewsDock.tsx`, and preferences in `useNewsStore` (only preferences are persisted).

## Studio scripts (Level 2 indicators)

Power users can write indicators in plain **JavaScript**. In **Studio → My indicators**, switch *Language* to **Script**, or start from one of the examples (Keltner, Supertrend, Z‑score, Stochastic RSI, Volume pressure). A script runs once over the whole candle history and draws with `plot()`. For per-candle logic, use `each((i, prev) => …)`.

```js
const len  = input('Length', 20, { min: 2, max: 200 });   // editable number
const mult = input('ATR mult', 2, { step: 0.25 });
const basis = ta.ema(close, len);
plot(basis, { title: 'Basis', style: 'dashed' });
plot(zip((b, a) => b + mult * a, basis, ta.atr(len)), { title: 'Upper' });
hline(0);  log('bars', n);
```

The full API is listed under *Script reference* in the editor:

- price arrays: `open/high/low/close/volume/time/hl2/hlc3/ohlc4`
- `input`, `plot` (line, dashed or histogram), `hline`, `each`, `zip`, `nz`, `log`
- `ta.*`: sma, ema, rma, wma, stdev, highest, lowest, sum, change, roc, rsi, tr, atr, vwap, crossover, crossunder

**Security model.** No user code is ever evaluated by the page's JavaScript engine. The repo contains no `eval` or `new Function`, and a unit test enforces this.

- **Separate engine.** Scripts run in [QuickJS](https://bellard.org/quickjs/) compiled to **WebAssembly** (`quickjs-emscripten`), inside a dedicated **Web Worker** (`src/lib/script/script.worker.ts`).
- **Nothing to reach.** The VM has its own heap and no DOM, network, storage, timers or host objects. `fetch`, `XMLHttpRequest`, `window` and similar names are simply undefined there. The worker also removes its own network and storage globals as defence in depth.
- **Hard limits per run.** Each run gets a fresh runtime with:
  - a **32 MB memory cap**
  - a **192 KB stack cap**
  - a **1 s CPU interrupt**
  - at most 20k characters of source
  - at most 8 plots, 8 levels, 12 inputs and 50 log lines

  If the worker itself stops answering, the host **terminates and replaces it** (`sandbox.ts`).
- **Data only comes out.** The VM receives plain JSON and returns JSON. The host re-validates everything it gets back: plot shape, lengths, numeric values, colours and string lengths.
- **Scheduling.** On the chart, scripts re-run at most once per second per indicator as live candles stream in. They re-run immediately when the code, the inputs or the symbol change.

Code: `src/lib/script/` holds `engine.ts`, `prelude.ts` (the in-VM API), `templates.ts` and `useScriptRuns.ts`. The editor UI is in `src/modules/studio/ScriptEditor.tsx`. Tests: `engine.test.ts` covers limits, isolation, errors with line numbers and every template, and there is an e2e test.

## Brand

The Aztex logo (`public/brand/aztex-logo.png`) is rebuilt as vectors in `src/app/Logo.tsx`: the full **wordmark** in the top bar and the pixel-**X** mark for the favicon. Colours sampled from the artwork:

| Role | Hex | Use |
| --- | --- | --- |
| Brand green | `#1F8A6E` | Outer X cells; the app's single accent (primary actions, active indicators, focus, key levels) |
| Ink | `#16130F` | Letters and X centre on light; light-theme text |
| Paper | `#F4F4F0` | Letters and X centre on dark; light-theme ground |

In the wordmark, the letters and the X's centre cell use `currentColor`, so they flip between ink and paper with the theme. The green cells stay fixed.

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

- **Theming (§3).** `styles/tokens.css` defines both palettes. The spec's original look was replaced by an institutional terminal design (see Styling above). Light mode has its own near-invisible `--shadow`. P/L colors are literal hex in the Appearance store and are mirrored to `--bull/--bear/--profit/--loss`. The categorical palette is fixed in `useThemeStore.CATEGORICAL`.
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

## Order flow & execution (beyond the original spec)

| Feature | Where | Notes |
| --- | --- | --- |
| Time & Sales tape | `terminal/TimeSales.tsx` | Aggressor-side prints; prints above the 95th percentile of notional are flagged ◆. Live: Binance `@aggTrade`. |
| Order-flow stats | `terminal/OrderFlow.tsx` | Buy/sell volume, delta, buy %, trades/s, tape VWAP, largest print, book imbalance and spread (bp) over 30s/1m/5m, plus a session cumulative-delta trace. |
| CVD indicator | `lib/orderflow`, chart pane | Uses real tape delta for candles the session observed, otherwise a bar estimate (volume × body / range). |
| Volume profile (VP) | chart overlay | Volume-by-price for the visible window, with POC and a 70% value area (VAH/VAL). |
| Session VWAP | chart overlay | Resets each UTC day. |
| Depth chart / liquidity heatmap | DOM panel tabs | Cumulative bid/ask curves; Bookmap-style heatmap of resting size over time with the mid traced. The simulated book has persistent liquidity walls. |
| TWAP execution | ticket → Execution | Splits the parent order into equal child market orders over the chosen duration, averaging into one position. Progress, average price, cancel, and slippage vs arrival are reported on completion. |
| News wire | `terminal/News.tsx` | Simulated headlines; filter to the selected symbol. |

**Pro workflow.**
- **Command palette** (⌘K / Ctrl K, or the search box in the top bar): fuzzy-jump to any symbol, page, workspace or panel, switch timeframe or chart style, toggle the volume profile or theme, change the data source, or flatten positions.
- **Watchlist** rows carry a 24h sparkline (real 15m history from the active provider) and a 24h change pill, with bid/ask under the last price.
- **Chart**: symbol watermark, a countdown to the forming candle's close under the last-price tag, resting limit orders drawn as labelled lines, and 24h high/low/volume in the header on wide screens.
- **Order ticket** shows pre-trade risk: max loss at SL, target at TP, reward-to-risk ratio and risk as a % of equity (flagged above 2%).
- **Order book** de-emphasises leading digits so the moving ones stand out, and marks levels where you have a resting order.
- **Positions** show P/L in R multiples (relative to the entry→stop distance) and time in trade.

**Fits the screen.** On desktop widths the Terminal is sized to the window rather than being a long page:

- The panels share the visible height: a main row (watchlist, chart, ticket, book…) and a bottom row (positions, orders & fills). Each panel scrolls inside itself, so the page itself doesn't scroll.
- The chart fills its panel, and indicator panes shrink on short screens so the whole chart is always visible.
- The order book shows as many levels as fit.
- The ticket's Buy/Sell button stays pinned in view.
- Drag the chart's bottom edge to trade height between the chart row and the bottom row; double-click it to reset.
- **Maximize** makes the chart fill exactly one screen.
- If more panels are switched on than fit side by side, they continue in rows below.
- Narrow windows and the Mobile preview keep a normal scrolling stack.
- The layout logic is in `lib/layout/fit.ts` (unit-tested).

**Workspaces.** The Terminal shows a curated set of panels per workspace so it stays data-rich without being overwhelming: **Trade** (watchlist, chart, ticket, order book, positions, orders & fills), **Order flow** (chart, book/heatmap, tape, flow stats, ticket) and **Monitor** (watchlist, positions, P/L, news). Each workspace keeps its own layout, and panels can be added or removed with **Panels**.

Keyboard: **F1–F8** switch modules; **/** focuses the command line. Panel function codes (GP, DOM, T&S…) appear in the dense **Desktop** platform mode.

## Renko, footprint & order-book profile

Pick a style from the chart's mode menu (or the command palette):

- **Renko.** Bricks are built from closes in the classic way:
  - A brick prints when the close moves one full box beyond the last brick, so a reversal needs two boxes.
  - Bricks sit on a fixed price grid.
  - Wicks show how far price ran against a brick while it was forming.
  - The box size is **automatic (ATR 14, rounded to 1/2/2.5/5 × 10ⁿ)** or a fixed value typed in the **Box** field.
  - Dashed lines mark the price that prints the next brick up or down.
  - Indicators, strategy signals and the volume profile all run on the brick series.
- **Footprint.** Shows sell × buy (bid × ask aggressor) volume per price row inside each bar:
  - Cells are shaded by delta, the most-traded row (POC) is outlined, and diagonal 3:1 imbalances are bolded.
  - **Total vol** and **Delta vol** rows sit underneath.
  - Bars are built from the live trade tape (`useFootprintStore`, ~1 bp ticks re-binned to readable rows as you zoom).
  - Bars from before the session started have no tape, so they are **estimated from OHLCV and marked as such**. A “live tape →” marker shows where real data begins.
  - Zoom in to 90 bars or fewer to see cells.
- **OB profile** (toolbar **OB** button). Resting order-book size at each level is drawn against the price axis, and outsized levels (walls) are labelled.

## Advanced order execution

The ticket prices every order against the **visible order book** before you send it, using the same model the order router fills with (`lib/trading/execution.ts`):

- **Pre-trade box:**
  - estimated average price and worst price
  - number of book levels swept, with mini depth bars showing what the order consumes
  - slippage vs the touch and impact vs mid, in bp
  - spread
  - maker/taker fee for your tier (mixed when part rests)
  - warnings and rejects, explained in plain language
- **Time in force** on limits:
  - **GTC** — the unfilled part rests on the book.
  - **IOC** — fill what you can now and cancel the rest.
  - **FOK** — fill completely now or not at all (otherwise rejected before sending).
- **Post-only.** Maker-only: an order that would cross is rejected. It forces GTC, as on most venues.
- **Market slippage limit** (bp from the touch). The part beyond it is cancelled.
- **Reduce-only:**
  - Closes opposite exposure oldest-first and never opens or flips a position.
  - It is sized as **% of the open position** (25/50/75/100) and clamped to what's open.
- **Bracket TP/SL.** Take-profit (limit, maker) and stop-loss (stop-market, taker) go out as live **one-cancels-other** exit orders. With the bracket off, TP/SL are alert levels only.
- **Orders & fills blotter** (Trade workspace):
  - **Open** — working limits and armed bracket legs, each cancellable.
  - **Orders** — full lifecycle: working → partially filled → filled / cancelled / rejected, with reasons, TIF/PO/RO/OCO flags, average fill and slippage vs the mid at send time.
  - **Fills** — price, qty, maker (M) or taker (T), fee; prices modelled beyond the visible book are marked ~.
  - **Quality** — TCA: average slippage vs arrival, implementation shortfall (slippage + fees), net fees, maker share, fill rate.
- **Book views.** The depth chart marks where the ticket's order would sweep to, and ladder levels it would take are highlighted.

Large orders can exceed the visible book (14–20 levels). In that case the tail is priced by extending the book's average level size and spacing, and is clearly flagged as an estimate. Real venues match against far deeper books.

## On-chain (F3)

A multi-chain scanner, whale and exchange-flow monitor, and on-chain alerts (`src/lib/onchain`, `src/modules/onchain`).

- **Networks:** Ethereum, Bitcoin, Solana, Arbitrum One, Base, Polygon PoS, BNB Smart Chain and Tron. Each declares what it supports; Bitcoin, for example, has no token contracts.
- **Search** recognises what you paste:
  - EVM / Bitcoin / Tron transaction hashes and Solana signatures
  - EVM, Bitcoin (bech32 and legacy), Solana and Tron addresses
  - block heights and Bitcoin block hashes
  - token symbols and names
- **Result views:**
  - **Transactions** — status, block, confirmations, value, fee, gas, decoded method and ERC-20 / SPL transfers, plus Bitcoin inputs and outputs.
  - **Wallets and contracts** — native and token balances, activity, contract standard and supported reads. EVM addresses also show **balances across every EVM chain**.
  - **Blocks** — with prev/next stepping.
  - **Tokens** — supply, holders, and **holder concentration**: top-10 share, HHI, holders needed for 50%, and share held on exchanges, shown *where the data source provides holder lists*.
  - Every view links to the chain's block explorer.
- **Whale & exchange flows.** Each large transfer is classified from labelled wallets as exchange inflow, exchange outflow, exchange-internal, mint, bridge, DeFi, or wallet → wallet.
  - What the chain shows (**observed**) is kept visibly separate from what it is often taken to mean (**inferred**). For example: *“a deposit is not a sale”*, *“a withdrawal is not a purchase”*.
  - The panel also shows last-hour inflow/outflow/net, stablecoin mints, an exchange-netflow chart, and network fees vs their rolling median.
- **Alerts** fire on any page (toast, alert log, count on the nav tab). There are four rule types:
  - **watched wallet moves funds** (direction, minimum size)
  - **large transfer** (asset, network, minimum size, exchange flows only)
  - **network fee spike** (an absolute level, or a % above the rolling median, with a cooldown)
  - **unusual token activity** (transfers or volume per minute, *n*σ above an EWMA baseline after warm-up)

  Bell icons on wallets, transfers, fees and tokens create rules in one click. You can label any address; your labels override the built-in ones.

**Data sources — read this.** There are two modes:

- **Simulated** (the default) is deterministic simulated chain data, and is labelled as such everywhere. Token metadata and contract addresses are real; balances, supplies, holder lists and flows are not.
- **Live RPC · beta** sends *searches* to public endpoints with no API keys: EVM JSON-RPC (publicnode), mempool.space for Bitcoin, and Solana mainnet RPC. You get real transactions, balances, blocks, ERC-20 metadata and supply, balances of well-known tokens, decoded transfers, Solana token supply and largest holder accounts.
  - Public RPC can't list a wallet's full history or EVM holder lists — the UI says so. Those need an indexer such as Etherscan, Covalent or a self-hosted one.
  - Tron needs an API key and stays simulated.
  - The whale/flow stream and alerts remain simulated in both modes. Production replaces `startOnchainFeed` with an indexer or mempool socket pushing the same `ChainTransfer` / `FeeSample` shapes.
  - The live adapters are unit-tested against the documented response formats, but **could not be exercised against the real endpoints from the build sandbox** (outbound network blocked). Expect to verify them on first run.
- The built-in label list is deliberately tiny: a few widely published exchange wallets. A maintained label provider is a production dependency.

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
