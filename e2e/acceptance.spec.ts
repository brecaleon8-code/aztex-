import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Skip the once-per-session brand intro in tests (in every window, incl. Studio / pop-ups).
  await page.context().addInitScript(() => sessionStorage.setItem('aztex.intro', '1'));
});

async function freshTerminal(page: Page) {
  await page.goto('/terminal');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/terminal');
  await expect(page.getByTestId('price-chart')).toBeVisible();
}

const balance = async (page: Page) => Number((await page.getByTestId('wallet-balance').innerText()).replace(/,/g, ''));

test.describe('Phase 1 — core terminal', () => {
  test('draw, add formula indicator, market + limit orders, chart levels, close, wallet updates', async ({ page }) => {
    await freshTerminal(page);
    const chart = page.getByTestId('price-chart');
    const box = (await chart.boundingBox())!;

    // Draw a trendline: click → rubber band → click.
    await page.getByTestId('tool-trend').click();
    await page.mouse.click(box.x + 120, box.y + 200);
    await page.mouse.move(box.x + 300, box.y + 120);
    await page.mouse.click(box.x + 300, box.y + 120);
    await expect(page.locator('.drawing line')).toHaveCount(1);
    await page.getByTestId('tool-cursor').click();

    // Custom indicator from a formula — with a clear inline error first.
    await page.getByTestId('add-indicator').click();
    await page.getByTestId('custom-indicator').click();
    await page.getByTestId('formula-input').fill('sma(close, 20) - smaa(close, 50)');
    await expect(page.getByTestId('formula-error')).toContainText('Unknown function "smaa"');
    await expect(page.getByTestId('formula-add')).toBeDisabled();
    await page.getByTestId('formula-input').fill('sma(close,20) - sma(close,50)');
    await page.getByTestId('formula-add').click();
    await expect(page.getByTestId('indicator-chip').filter({ hasText: 'My indicator' })).toBeVisible();
    await expect(page.getByTestId('osc-custom')).toBeVisible();

    // Market order with felt weight: placing → placed → toast.
    const before = await balance(page);
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('place-order')).toContainText('Placing order');
    await expect(page.getByTestId('place-order')).toContainText('Order placed');
    await expect(page.getByTestId('toast').filter({ hasText: 'market order placed' })).toBeVisible();
    await expect(page.getByTestId('position-row')).toHaveCount(1);
    expect(await balance(page)).toBeLessThan(before);

    // Chart shows the live position's levels, not the draft.
    await expect(chart.locator('text', { hasText: 'Long entry' })).toBeVisible();

    // Limit order from the book: click a bid → ticket switches to Limit with that price.
    const bidPrice = (await page.getByTestId('ob-bid-4').locator('.ob-price').innerText()).replace(/,/g, '');
    await page.getByTestId('ob-bid-4').click();
    await expect(page.getByRole('button', { name: 'Limit', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // The book refreshes every second, so allow for the level having moved by a few ticks.
    const limit = Number(await page.getByTestId('limit-price').inputValue());
    expect(Math.abs(limit - Number(bidPrice)) / Number(bidPrice)).toBeLessThan(0.002);
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('toast').filter({ hasText: /limit order (placed|filled)/ })).toBeVisible();

    // TP/SL inputs: clearing never corrupts state.
    await page.getByTestId('tp-input').fill('');
    await expect(page.getByTestId('place-order')).toBeEnabled({ timeout: 3000 });
    await page.getByTestId('tp-input').blur();
    await expect(page.getByTestId('tp-input')).not.toHaveValue('');

    // Close → settles into wallet with toast.
    const mid = await balance(page);
    await page.getByTestId('close-position').first().click();
    await expect(page.getByTestId('toast').filter({ hasText: /Closed long BTC/ })).toBeVisible();
    await expect.poll(() => balance(page)).toBeGreaterThan(mid);
  });

  test('zoom + pixel-accumulator pan reveal history; jump to live', async ({ page }) => {
    await freshTerminal(page);
    // At rest the chart follows the live edge (no "viewing history" pill) even as candles append.
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('jump-live')).toHaveCount(0);
    const chart = page.getByTestId('price-chart');
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + 300, box.y + 150);
    await page.mouse.down();
    for (let i = 0; i < 30; i++) await page.mouse.move(box.x + 300 + i * 4, box.y + 150);
    await page.mouse.up();
    await expect(page.getByTestId('jump-live')).toBeVisible();
    // No native text selection after dragging across the chart.
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
    await page.getByTestId('jump-live').click();
    await expect(page.getByTestId('jump-live')).toHaveCount(0);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.locator('.chart-zoom .label')).toHaveText('75 bars');
  });

  test('light/dark toggle switches palettes', async ({ page }) => {
    await freshTerminal(page);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const dark = await bg();
    // Theme lives in the account menu (System / Dark / Light), as on TradingView.
    await page.getByTestId('account-menu').click();
    await page.getByTestId('theme-light').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(bg).not.toBe(dark);
    // CLI bar stays a literal dark terminal in light mode.
  });

  test('CLI drives real app state from any route', async ({ page }) => {
    await freshTerminal(page);
    await page.getByRole('link', { name: 'OTC Desk' }).click();
    const cli = page.getByLabel('Command line');
    await cli.fill('buy 0.5 eth');
    await cli.press('Enter');
    await expect(page.getByTestId('cli-result')).toContainText('✓ BUY 0.5');
    await cli.fill('theme light');
    await cli.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await cli.fill('frobnicate');
    await cli.press('Enter');
    await expect(page.getByTestId('cli-result')).toContainText('✗ Unknown command');
    await page.getByRole('link', { name: 'Terminal' }).click();
    await expect(page.getByTestId('position-row')).toHaveCount(1);
    await expect(page.getByTestId('chart-panel')).toContainText('ETH/USDT');
    await cli.fill('close all');
    await cli.press('Enter');
    await expect(page.getByTestId('position-row')).toHaveCount(0);
  });
});

test('order flow: tape prints, flow stats, depth + heatmap views, volume profile, TWAP', async ({ page }) => {
  await page.goto('/terminal');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/terminal');
  // Order-flow tools live in their own workspace to keep the Trade view calm.
  await expect(page.getByTestId('tape')).toHaveCount(0);
  await page.getByTestId('ws-flow').click();
  await expect(page.getByTestId('tape-row').first()).toBeVisible();
  await expect(page.getByTestId('order-flow')).toContainText('TRADES/S');
  await expect(page.getByTestId('volume-profile')).toBeAttached();
  await page.getByTestId('toggle-vp').click();
  await expect(page.getByTestId('volume-profile')).toHaveCount(0);
  await page.getByRole('button', { name: 'Depth', exact: true }).click();
  await expect(page.getByTestId('depth-chart').locator('svg')).toBeVisible();
  await page.getByRole('button', { name: 'Heatmap' }).click();
  await expect(page.getByTestId('heatmap').locator('canvas')).toBeVisible();
  // TWAP: parent order sliced into children on one averaged position.
  await page.getByTestId('ws-trade').click();
  await page.getByRole('button', { name: 'TWAP', exact: true }).click();
  await page.getByTestId('twap-minutes').fill('1');
  await page.getByTestId('twap-slices').fill('30');
  await page.getByTestId('place-order').click();
  await expect(page.getByTestId('algo-row')).toContainText('TWAP');
  await expect(page.getByTestId('position-row')).toHaveCount(1);
  await expect(page.getByTestId('algo-row')).toContainText(/[2-9]\/30|1\d\/30/, { timeout: 8000 });
  await page.getByTestId('algo-row').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('algo-row')).toContainText('cancelled');
});

test('Phase 2 — discovery: search, comparison, scanner alerts', async ({ page }) => {
  await page.goto('/discovery');
  await page.getByTestId('currency-search').fill('dog');
  await page.getByTestId('search-result-DOGE').click();
  await expect(page.locator('[data-share-row="DOGE"]')).toHaveClass(/selected/);
  await page.getByTestId('compare-AVAX').click();
  await expect(page.getByTestId('compare-AVAX')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('comparison').locator('.recharts-line')).toHaveCount(4);
  const rows = await page.getByTestId('scanner-row').count();
  expect(rows).toBeGreaterThan(5);
  await page.getByTestId('alert-threshold').fill('1');
  await page.getByTestId('add-alert').click();
  await expect(page.getByTestId('alert-rule')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('alert-rule')).toHaveCount(1); // persisted
});

test('Phase 3 — community: exchange a trade via chat, forum trade chip', async ({ page }) => {
  await page.goto('/community');
  await page.getByTestId('attach-trade').first().click();
  await page.getByRole('button', { name: /Ticket draft/ }).click();
  await page.getByTestId('message-input').fill('My setup');
  await page.getByTestId('send-message').click();
  const chat = page.getByTestId('chat');
  await expect(chat.getByTestId('message').last()).toContainText('My setup');
  // Counterparty replies with their own (opposite) live trade.
  await expect(chat.getByTestId('trade-chip')).toHaveCount(3, { timeout: 6000 });
  await page.getByTestId('post-input').fill('Range high reclaim');
  await page.getByTestId('attach-trade').last().click();
  await page.getByRole('button', { name: /Ticket draft/ }).click();
  await page.getByTestId('publish-post').click();
  const first = page.getByTestId('post').first();
  await expect(first).toContainText('Range high reclaim');
  await expect(first.getByTestId('trade-chip-pnl')).toHaveText(/^[+-]\d+\.\d{2}%$/);
});

test.describe('Phase 4 — OTC + appearance', () => {
  test('quote expires and disables Accept', async ({ page }) => {
    await page.clock.install();
    await page.goto('/otc');
    await page.getByTestId('request-quote').click();
    await page.clock.runFor(800);
    await expect(page.getByTestId('quote')).toBeVisible();
    await expect(page.getByTestId('accept-quote')).toBeEnabled();
    await page.clock.runFor(15_500);
    await expect(page.getByTestId('quote-countdown')).toHaveText('Expired');
    await expect(page.getByTestId('accept-quote')).toBeDisabled();
  });

  test('accepting a live quote lands in the blotter', async ({ page }) => {
    await page.goto('/otc');
    await page.getByTestId('request-quote').click();
    await page.getByTestId('accept-quote').click();
    await expect(page.getByTestId('blotter-row').first()).toBeVisible();
  });

  test('chart colours live on the chart: right-click › Settings, gear, F8 or Ctrl+,; presets; live without reload', async ({ page }) => {
    await page.goto('/terminal');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/terminal');
    const chart = page.getByTestId('price-chart');
    await expect(chart).toBeVisible();
    // Right-click the chart → quick actions → Settings… opens the chart settings at the cursor.
    await chart.click({ button: 'right', position: { x: 200, y: 150 } });
    await page.getByTestId('ctx-settings').click();
    const menu = page.getByTestId('chart-settings-menu');
    await expect(menu).toBeVisible();
    await page.getByTestId('color-bull').fill('#1144ff');
    await expect(chart.locator('rect[fill="#1144ff"]').first()).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    // F8 (MT5's chart properties key) and the gear open the same menu; presets apply in one click.
    await page.keyboard.press('F8');
    await expect(menu).toBeVisible();
    await page.getByTestId('preset-cb').click();
    await expect(page.getByTestId('preset-cb')).toHaveAttribute('aria-pressed', 'true');
    await expect(chart.locator('rect[fill="#3B82F6"]').first()).toBeAttached();
    await page.getByTestId('reset-colors').click();
    await expect(chart.locator('rect[fill="#3DDC97"]').first()).toBeAttached();
    await page.keyboard.press('Escape');
    await page.getByTestId('chart-settings').click();
    await expect(menu).toContainText('Data feed');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Comma');
    await expect(menu).toBeVisible();
    // The old Appearance page is gone: its URL lands on the terminal.
    await page.goto('/appearance');
    await expect(page).toHaveURL(/\/terminal$/);
    await expect(page.getByRole('link', { name: 'Appearance' })).toHaveCount(0);
  });
});

test('panels reorder by dragging their header and the layout persists', async ({ page }) => {
  await page.goto('/terminal');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/terminal');
  const order = () => page.locator('.tile').evaluateAll((els) => els.sort((a, b) => Number((a as HTMLElement).style.order) - Number((b as HTMLElement).style.order)).map((e) => (e as HTMLElement).dataset.panel));
  expect((await order())[0]).toBe('watchlist');
  await page.locator('[data-panel="orderbook"] .panel-title').dragTo(page.locator('[data-panel="watchlist"] .panel-title'));
  expect((await order())[0]).toBe('orderbook');
  await page.reload();
  expect((await order())[0]).toBe('orderbook');
  // Panels can be added to / removed from a workspace.
  await page.getByTestId('panel-picker').click();
  await page.getByRole('menuitemcheckbox', { name: 'News' }).click();
  await expect(page.getByTestId('news')).toBeVisible();
  await page.getByRole('menuitemcheckbox', { name: 'News' }).click();
  await expect(page.getByTestId('news')).toHaveCount(0);
});

test('pro polish: command palette, sparklines, risk panel, countdown, resting-order markers, R multiple', async ({ page }) => {
  await page.goto('/terminal');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/terminal');
  await expect(page.getByTestId('price-chart')).toBeVisible();

  // Watchlist sparklines load from provider history.
  await expect(page.getByTestId('watch-BTC').locator('svg.spark path').first()).toBeAttached();
  // Chart: live candle-close countdown + 24h stats.
  await expect(page.getByTestId('candle-countdown')).toContainText(/\d\d:\d\d/);
  await expect(page.getByTestId('stats24')).toContainText('24h H');
  // Ticket: pre-trade risk with the default ±3.2% / ±1.6% levels → R:R 2.00.
  await expect(page.getByTestId('risk-rr')).toHaveText('2.00');

  // Resting limit order shows on the chart and in the book.
  await page.getByTestId('ob-bid-8').click();
  await page.getByTestId('place-order').click();
  await expect(page.getByTestId('working-order')).toHaveCount(1);
  await expect(page.getByTestId('chart-working-order')).toHaveCount(1);

  // Positions show R multiple.
  const cli = page.getByLabel('Command line');
  await cli.fill('buy 0.01 btc');
  await cli.press('Enter');
  await expect(page.getByTestId('position-r').first()).toContainText('R');

  // Command palette: fuzzy jump to a symbol, then switch workspace.
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByLabel('Command palette search').fill('sol');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('command-palette')).toHaveCount(0);
  await expect(page.getByTestId('chart-panel')).toContainText('SOL');
  await page.getByTestId('palette-trigger').click();
  await page.getByLabel('Command palette search').fill('order flow');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('ws-flow')).toHaveAttribute('aria-selected', 'true');
});

test.describe('Account features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/terminal');
    await page.evaluate(() => localStorage.clear());
  });

  test('Add crypto: pick coin + network, memo shown, simulated deposit credits holdings', async ({ page }) => {
    await page.goto('/terminal');
    await page.getByTestId('open-deposit').click();
    const modal = page.getByTestId('deposit-modal');
    await expect(modal).toContainText('Demo environment');
    await page.getByTestId('dep-asset-USDT').click();
    // Multi-network asset: must choose a network before an address is shown.
    await expect(page.getByTestId('dep-address')).toHaveCount(0);
    await page.getByTestId('dep-net-tron').click();
    await expect(page.getByTestId('dep-address')).toHaveText(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    await expect(modal.locator('.dep-qr svg')).toBeVisible();
    // Memo-based network shows a required tag.
    await page.getByTestId('dep-asset-XRP').click();
    await expect(page.getByTestId('dep-memo')).toHaveText(/^\d{9}$/);
    await page.getByTestId('dep-simulate').click();
    await expect(page.getByTestId('dep-history-row').first()).toContainText('Credited', { timeout: 6000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('account-menu').click();
    await page.getByTestId('menu-account').click();
    await expect(page.getByTestId('holding-XRP')).toBeVisible();
  });

  test('Partner codes: issue → redeem → lower fees; typos and reuse rejected; revoke resets tier', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByTestId('current-tier')).toHaveText('Standard');
    await page.getByTestId('issue-partner').fill('Meridian Liquidity');
    await page.getByTestId('issue-code').click();
    const code = (await page.getByTestId('fresh-code').locator('.mono').innerText()).trim();
    expect(code).toMatch(/^LP-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // A one-character typo fails the checksum before any lookup.
    const typo = code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A');
    await page.getByTestId('partner-code-input').fill(typo);
    await expect(page.getByTestId('redeem-code')).toBeDisabled();

    await page.getByTestId('partner-code-input').fill(code.toLowerCase());
    await page.getByTestId('redeem-code').click();
    await expect(page.getByTestId('current-tier')).toHaveText('Liquidity Provider');
    await expect(page.getByTestId('tier-chip')).toContainText('Liquidity Provider');

    // Ticket shows the LP taker fee.
    await page.getByRole('link', { name: 'Terminal' }).click();
    await expect(page.getByTestId('ticket-fee')).toBeVisible();
    await expect(page.locator('.ticket-summary')).toContainText('Liquidity Provider taker');

    // Revoking the applied code drops the account back to Standard.
    await page.getByTestId('account-menu').click();
    await page.getByTestId('menu-account').click();
    await page.getByTestId('registry-row').filter({ hasText: code }).getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByTestId('current-tier')).toHaveText('Standard');
  });

  test('Studio: save a custom indicator, add it to the chart, backtest a strategy and plot its signals', async ({ page }) => {
    await page.goto('/studio.html');
    await page.getByTestId('new-indicator').click();
    await page.getByTestId('ind-name').fill('Range %');
    await page.getByTestId('ind-formula').fill('(high - low) / close * 100 >');
    await expect(page.getByTestId('ind-formula-error')).toBeVisible();
    await expect(page.getByTestId('ind-save')).toBeDisabled();
    await page.getByTestId('ind-formula').fill('(high - low) / close * 100');
    await page.getByTestId('ind-save').click();
    await expect(page.getByTestId('indicator-item').filter({ hasText: 'Range %' })).toBeVisible();
    await page.getByTestId('ind-add-chart').click();

    await page.getByTestId('strategy-template').selectOption({ label: 'Donchian breakout' });
    await expect(page.getByTestId('backtest-results')).toContainText('Net return');
    // Studio is its own app: "Show on chart" brings the terminal forward (a new window here).
    const [terminal] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('strat-chart').click()]);
    await expect(terminal).toHaveURL(/\/terminal/);
    await expect(terminal.getByTestId('chart-strategy-chip')).toContainText('Donchian breakout');
    await expect(terminal.getByTestId('indicator-chip').filter({ hasText: 'Range %' })).toBeVisible();
    await expect(terminal.getByTestId('strategy-marker').first()).toBeAttached({ timeout: 8000 });
  });
  test('Studio scripts: sandboxed JavaScript indicator — preview, limits, errors, and on the chart', async ({ page }) => {
    await page.goto('/studio.html');
    await page.getByTestId('new-indicator').click();
    await page.getByTestId('ind-name').fill('Z test');
    await page.getByRole('group', { name: 'Indicator language' }).getByRole('button', { name: 'Script' }).click();
    await page.getByTestId('script-template').selectOption({ label: 'Z-score' });
    await expect(page.getByTestId('script-ok')).toContainText('1 plot', { timeout: 10000 });
    await expect(page.getByTestId('script-preview')).toBeVisible();
    await expect(page.getByTestId('script-inputs')).toContainText('Length');

    // No network inside the sandbox.
    await page.getByTestId('ind-script').fill('plot(close)\nfetch("https://example.com")');
    await expect(page.getByTestId('script-error')).toContainText('fetch', { timeout: 10000 });
    await expect(page.getByTestId('script-error')).toContainText('line 2');
    await expect(page.getByTestId('ind-save')).toBeDisabled();

    // Infinite loops are stopped; the page stays responsive.
    await page.getByTestId('ind-script').fill('while (true) {}');
    await expect(page.getByTestId('script-error')).toContainText('Time limit', { timeout: 10000 });
    await expect(page.getByTestId('ind-name')).toBeEditable();

    await page.getByTestId('script-template').selectOption({ label: 'Z-score' });
    await expect(page.getByTestId('script-ok')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('ind-save').click();
    await expect(page.getByTestId('indicator-item').filter({ hasText: 'Z test' })).toBeVisible();
    await page.getByTestId('ind-add-chart').click();

    await page.goto('/terminal');
    await expect(page.getByTestId('indicator-chip').filter({ hasText: 'Z test' })).toBeVisible();
    await expect(page.getByTestId('osc-value').last()).toHaveText(/^-?\d+\.\d{2}$/, { timeout: 10000 });
  });
  test('News dock: pin left/right, live headlines, calendar, filters, collapse, persistence', async ({ page }) => {
    await page.goto('/terminal');
    await page.getByTestId('news-toggle').click();
    const dock = page.getByTestId('news-dock');
    await expect(dock).toBeVisible();
    await expect(dock).toHaveClass(/right/);
    await expect(page.getByTestId('news-story').first()).toBeVisible();
    await expect(page.getByTestId('news-next')).toContainText('Next high impact');

    // Filter to a single category.
    await page.getByTestId('news-cat-regulation').click();
    const cats = await page.getByTestId('news-story').locator('.nd-src').allInnerTexts();
    expect(cats.length).toBeGreaterThan(0);
    expect(new Set(cats)).toEqual(new Set(['Reg Watch']));

    // Calendar with countdowns and a "now" marker.
    await page.getByTestId('news-tab-calendar').click();
    await expect(page.getByTestId('news-event').first()).toBeVisible();
    await expect(page.getByTestId('news-calendar')).toContainText('Now ·');

    // Swap sides; it stays pinned across pages and reloads.
    await page.getByTestId('news-swap').click();
    await expect(dock).toHaveClass(/left/);
    await page.goto('/get-studio');
    await expect(page.getByTestId('news-dock')).toHaveClass(/left/);
    await page.reload();
    await expect(page.getByTestId('news-dock')).toHaveClass(/left/);

    // Collapse to a rail, expand, then close with the keyboard.
    await page.getByLabel('Collapse to rail').click();
    await expect(page.getByTestId('news-rail')).toBeVisible();
    await page.getByLabel('Expand news').click();
    await expect(page.getByTestId('news-dock')).toBeVisible();
    await page.keyboard.press('Alt+KeyN');
    await expect(page.getByTestId('news-dock')).toHaveCount(0);
  });
});

test.describe('Charts & execution', () => {
  test('Renko and footprint chart modes, order-book profile', async ({ page }) => {
    await freshTerminal(page);
    await expect(page.getByTestId('book-profile')).toBeAttached();
    await page.getByTestId('chart-mode').selectOption('renko');
    await expect(page.getByTestId('renko-next')).toContainText('next brick');
    await expect(page.getByTestId('ohlcv')).toContainText('Brick · box');
    // A fixed box size re-bricks the series; clearing it returns to automatic (ATR).
    await page.getByTestId('renko-box').fill('5');
    await page.getByTestId('renko-box').press('Enter');
    await expect(page.getByTestId('ohlcv')).toContainText('box 5');
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    await page.getByTestId('chart-mode').selectOption('footprint');
    await expect(page.getByTestId('footprint')).toBeAttached();
    await expect(page.getByTestId('footprint-legend')).toContainText('sell | buy');
    await expect(page.getByTestId('footprint-stats')).toContainText('Delta vol');
    await expect(page.locator('.fp-bar[data-source="est"]').first()).toBeAttached();
    // Live tape builds the newest bar's footprint.
    await expect(page.locator('.fp-bar[data-source="partial"], .fp-bar[data-source="live"]').first()).toBeAttached({ timeout: 8000 });
    await page.getByTestId('chart-mode').selectOption('candles');
  });

  test('Pre-trade preview, TIF / post-only / reduce-only / bracket, blotter and TCA', async ({ page }) => {
    await freshTerminal(page);
    // Pre-trade: priced against the book.
    await expect(page.getByTestId('exec-avg')).toBeVisible();
    await expect(page.getByTestId('exec-slippage')).toContainText('bp');
    await expect(page.getByTestId('ticket-fee')).toContainText('USDT');

    // Market buy with a bracket → two armed OCO exits in the blotter.
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('position-row')).toHaveCount(1);
    await expect(page.getByTestId('blotter-open-row')).toHaveCount(2);
    await expect(page.getByTestId('blotter-open')).toContainText('OCO');

    // FOK limit at the bid can't fill now → preview rejects and the button is disabled.
    await page.getByRole('button', { name: 'Limit', exact: true }).click();
    await page.getByRole('group', { name: 'Time in force' }).getByRole('button', { name: 'FOK' }).click();
    await expect(page.getByTestId('exec-reject')).toContainText('FOK');
    await expect(page.getByTestId('place-order')).toBeDisabled();
    // Post-only forces GTC and rests as maker (well below the market so it can't fill mid-test).
    const bid = Number(await page.getByTestId('limit-price').inputValue());
    await page.getByTestId('limit-price').fill(String(Math.round(bid * 0.95)));
    await page.getByTestId('limit-price').press('Enter');
    await page.getByTestId('post-only').click();
    await expect(page.getByRole('group', { name: 'Time in force' }).getByRole('button', { name: 'GTC' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('place-order')).toContainText('post-only');
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('blotter-open-row')).toHaveCount(3);

    // Reduce-only sell closes the long; no exits are attached to it.
    await page.getByTestId('post-only').click();
    await page.getByRole('button', { name: 'Market', exact: true }).click();
    await page.getByRole('button', { name: 'Sell / Short' }).click();
    await page.getByTestId('reduce-only').click();
    await expect(page.getByTestId('reduce-note')).toBeVisible();
    // Reduce-only sizes as a share of the open position (default 100%), not of equity.
    await expect(page.getByTestId('reduce-sizing')).toContainText('Close % of long position');
    await expect(page.getByTestId('bracket')).toBeDisabled();
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('position-row')).toHaveCount(0, { timeout: 4000 });
    // Bracket legs were cancelled with the position; only the resting post-only bid remains.
    await expect(page.getByTestId('blotter-open-row')).toHaveCount(1);

    // History, fills and execution quality.
    await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: 'Orders' }).click();
    await expect(page.getByTestId('blotter-orders')).toContainText('RO');
    await expect(page.getByTestId('blotter-order-row').first()).toHaveAttribute('data-status', 'filled');
    await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: 'Fills' }).click();
    await expect(page.getByTestId('blotter-fill-row').first()).toBeVisible();
    await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: 'Quality' }).click();
    await expect(page.getByTestId('blotter-tca')).toContainText('Avg slippage vs arrival');

    // Depth chart marks where a market order of the ticket's size would sweep to.
    await page.getByTestId('reduce-only').click();
    await page.getByRole('group', { name: 'Book view' }).getByRole('button', { name: 'Depth' }).click();
    await expect(page.getByTestId('depth-order')).toBeAttached();
  });
});

test.describe('On-chain', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/onchain');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/onchain');
  });

  test('multi-chain search: wallet, token concentration, block, transaction; labels and watch rules', async ({ page }) => {
    await expect(page.getByTestId('oc-mode-badge')).toContainText('Simulated');
    // Query-type detection as you type.
    await page.getByTestId('oc-search-input').fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
    await expect(page.getByTestId('oc-query-hint')).toContainText('Bitcoin address');
    await page.getByTestId('oc-search-go').click();
    await expect(page.getByTestId('oc-address')).toContainText('Bitcoin');
    await expect(page).toHaveURL(/q=bc1q/);

    // EVM wallet: entity label, cross-chain balances, user label, watch rule.
    await page.getByTestId('oc-search-input').fill('');
    await page.getByTestId('oc-example').filter({ hasText: 'Exchange wallet' }).click();
    await expect(page.getByTestId('oc-address')).toContainText('Binance');
    await expect(page.getByTestId('oc-crosschain')).toContainText('Arbitrum One');
    await page.getByTestId('oc-label-btn').click();
    await page.getByTestId('oc-label-input').fill('Desk hot wallet');
    await page.getByTestId('oc-label-input').press('Enter');
    await expect(page.getByTestId('oc-address')).toContainText('Desk hot wallet');
    await page.getByTestId('oc-watch-wallet').click();
    await expect(page.getByTestId('oc-rule')).toHaveCount(1);
    await expect(page.getByTestId('oc-rules')).toContainText('Desk hot wallet');

    // Token: supply, holder concentration, unusual-activity alert.
    await page.goto('/onchain?q=USDT&net=ethereum');
    await expect(page.getByTestId('oc-token')).toContainText('Tether USD');
    await expect(page.getByTestId('oc-concentration')).toContainText('Top 10 hold');
    await page.getByTestId('oc-watch-token').click();
    await expect(page.getByTestId('oc-rule')).toHaveCount(2);

    // Block: step to the next height.
    await page.goto('/onchain');
    await page.getByTestId('oc-example').filter({ hasText: 'Bitcoin block' }).click();
    const h = Number((await page.getByTestId('oc-block-height').innerText()).replace(/,/g, ''));
    await page.getByRole('button', { name: 'Next block' }).click();
    await expect(page.getByTestId('oc-block-height')).toHaveText((h + 1).toLocaleString('en-US'));

    // Transaction (examples show while the search box is empty).
    await page.goto('/onchain');
    await page.getByTestId('oc-example').filter({ hasText: 'Ethereum transaction' }).click();
    await expect(page.getByTestId('oc-tx')).toContainText(/Success|Failed|Pending/);
    await expect(page.getByTestId('oc-tx')).toContainText('Etherscan');
  });

  test('whale & exchange flows separate observed from inferred; alerts fire app-wide', async ({ page }) => {
    await expect(page.getByTestId('oc-flow-row').first()).toBeVisible();
    await expect(page.getByTestId('oc-flow-summary')).toContainText('Net to exchanges');
    await page.getByRole('group', { name: 'Flow type' }).getByRole('button', { name: 'Exchange in' }).click();
    const kinds = await page.getByTestId('oc-flow-row').locator('.oc-kind-chip').allInnerTexts();
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['Exchange inflow']));
    await expect(page.getByTestId('oc-flow-row').first().locator('.oc-inferred')).toContainText('not a sale');
    await expect(page.getByTestId('oc-netflow')).toContainText('Inflow to exchanges');
    await expect(page.getByTestId('oc-fee-row')).toHaveCount(8);

    // A broad large-transfer rule triggers from the live stream.
    await page.getByTestId('oc-rule-min').selectOption('100000');
    await page.getByTestId('oc-add-rule').click();
    await expect(page.getByTestId('oc-hit').first()).toBeVisible({ timeout: 15000 });
    // …and keeps firing on other pages, counted on the nav tab.
    await page.getByRole('link', { name: 'Terminal' }).click();
    await expect(page.getByTestId('onchain-unseen')).toBeVisible({ timeout: 15000 });

    // Live mode switches the search source and says what stays simulated.
    await page.getByRole('link', { name: /On-chain/ }).click();
    await page.getByRole('group', { name: 'Data source' }).getByRole('button', { name: /Live RPC/ }).click();
    await expect(page.getByTestId('oc-mode-badge')).toContainText('live public RPC');
    await page.getByRole('group', { name: 'Data source' }).getByRole('button', { name: 'Simulated' }).click();
  });
});

test.describe('Fit to screen', () => {
  test('Terminal fits a laptop screen: no page scroll, whole chart and Buy button visible, maximize fills the screen', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 657 });
    await freshTerminal(page);
    await expect(page.locator('.terminal-grid')).toHaveAttribute('data-fit', 'on');
    const noScroll = () => page.evaluate(() => {
      const c = document.querySelector('.content') as HTMLElement;
      return c.scrollHeight <= c.clientHeight + 1;
    });
    await expect.poll(noScroll).toBe(true);
    const vh = 657;
    const bottomOf = async (testId: string) => (await page.getByTestId(testId).boundingBox())!.y + (await page.getByTestId(testId).boundingBox())!.height;
    expect(await bottomOf('chart-panel')).toBeLessThanOrEqual(vh);
    expect(await bottomOf('place-order')).toBeLessThanOrEqual(vh);
    expect(await bottomOf('positions')).toBeLessThanOrEqual(vh);
    // Indicator panes are inside the chart panel, on screen.
    expect(await bottomOf('osc-volume')).toBeLessThanOrEqual(vh);

    // Dragging the chart's bottom edge trades height between the chart row and the bottom row
    // (on a taller window — on this one the chart row is already at its minimum).
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect.poll(noScroll).toBe(true);
    const before = (await page.getByTestId('positions').boundingBox())!.height;
    const h = (await page.getByTestId('row-split').boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y - 60, { steps: 4 });
    await page.mouse.up();
    expect((await page.getByTestId('positions').boundingBox())!.height).toBeGreaterThan(before + 30);
    await expect.poll(noScroll).toBe(true);

    // Maximize: the chart fills exactly one screen.
    await page.setViewportSize({ width: 1366, height: 657 });
    await page.getByRole('button', { name: 'Maximize chart' }).click();
    expect(await bottomOf('chart-panel')).toBeLessThanOrEqual(vh);
    expect((await page.getByTestId('chart-panel').boundingBox())!.height).toBeGreaterThan(400);
    await page.getByRole('button', { name: 'Restore chart' }).click();

    // The Mobile preview keeps a normal scrolling stack.
    await page.getByTestId('account-menu').click();
    await page.getByRole('group', { name: 'Layout density' }).getByRole('button', { name: 'Mobile' }).click();
    await expect(page.locator('.terminal-grid')).toHaveAttribute('data-fit', 'off');
  });
});

test.describe('Indicator quick edit', () => {
  test('edit built-ins, formulas and scripts from the chart without opening Studio', async ({ page }) => {
    await freshTerminal(page);
    const chip = (text: string | RegExp) => page.getByTestId('indicator-chip').filter({ hasText: text });

    // Built-in: length + source apply live; hide/show; duplicate; reset.
    await chip('EMA 21').getByTestId('indicator-edit').click();
    await expect(page.getByTestId('quick-edit')).toContainText('Exponential moving average');
    await page.getByRole('button', { name: 'Increase Length' }).click();
    await expect(chip('EMA 22')).toBeVisible();
    await page.getByTestId('qe-source').selectOption('hl2');
    await expect(chip('EMA 22 · hl2')).toBeVisible();
    await page.getByTestId('qe-hide').click();
    await expect(chip('EMA 22')).toHaveClass(/off/);
    await page.getByTestId('qe-hide').click();
    await expect(chip('EMA 22')).not.toHaveClass(/off/);
    await page.getByTestId('qe-duplicate').click();
    await expect(chip('EMA 22 · hl2')).toHaveCount(2);
    await page.getByTestId('qe-reset').click();
    await expect(chip('EMA 21')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-edit')).toHaveCount(0);

    // Oscillator pane gear: RSI levels.
    await page.getByTestId('add-indicator').click();
    await page.getByRole('button', { name: 'RSI 14' }).click();
    await page.getByTestId('osc-rsi').getByTestId('osc-edit').click();
    await page.getByTestId('qe-ob').fill('80');
    await expect(page.getByTestId('osc-rsi').locator('text', { hasText: /^80$/ })).toBeAttached();
    await page.getByTestId('qe-period').fill('21');
    await expect(chip('RSI 21')).toBeVisible();
    await page.keyboard.press('Escape');

    // Formula: invalid edits don't break the chart; valid ones apply.
    await page.getByTestId('add-indicator').click();
    await page.getByTestId('custom-indicator').click();
    await page.getByTestId('formula-add').click();
    await chip('My indicator').getByTestId('indicator-edit').click();
    await page.getByTestId('qe-formula').fill('ema(close, 9) -');
    await expect(page.getByTestId('qe-formula-error')).toBeVisible();
    await expect(page.getByTestId('osc-custom')).toBeVisible();
    await page.getByTestId('qe-formula').fill('ema(close, 9) - ema(close, 30)');
    await expect(page.getByTestId('qe-formula-error')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Indicator name' }).fill('Trend gap');
    await expect(chip('Trend gap')).toBeVisible();
    await page.getByTestId('qe-save').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Saved to library' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Script from the library: tune its inputs on the chart, then push back to Studio.
    await page.getByTestId('add-indicator').click();
    await page.getByTestId('my-indicator').filter({ hasText: 'Keltner' }).click();
    await chip('Keltner').getByTestId('indicator-edit').click();
    await expect(page.getByTestId('qe-input-Length')).toHaveValue('20', { timeout: 10000 });
    await page.getByRole('button', { name: 'Increase Length' }).click();
    await expect(page.getByTestId('qe-input-Length')).toHaveValue('21');
    await page.getByTestId('qe-code-toggle').click();
    await expect(page.getByTestId('qe-code')).toBeVisible();
    await page.getByTestId('qe-save').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Library updated' })).toBeVisible();
  });
});

test.describe('Chart tabs, layouts & apps', () => {
  test('tabs per crypto drive the ticket; up to 4 charts per tab; focus a pane; everything persists', async ({ page }) => {
    await freshTerminal(page);
    const tabs = page.getByTestId('chart-tab');
    await expect(tabs).toHaveCount(3);
    await expect(tabs.first()).toHaveAttribute('data-symbol', 'BTC');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    // Open DOGE in a new tab: it becomes active and the book / ticket follow it.
    await page.getByTestId('new-tab').click();
    await page.getByTestId('new-tab-DOGE').click();
    await expect(tabs).toHaveCount(4);
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('orderbook')).toContainText('DOGE/USDT');

    // Switch tab → symbol switches; picking from the watchlist retargets the active tab.
    await tabs.nth(1).click();
    await expect(page.getByTestId('orderbook')).toContainText('ETH/USDT');
    await page.getByTestId('watch-XRP').click();
    await expect(tabs.nth(1)).toHaveAttribute('data-symbol', 'XRP');
    // Close a tab with its ×.
    await tabs.last().getByTestId('chart-tab-close').click();
    await expect(tabs).toHaveCount(3);

    // 4 charts on one page for this tab, each with its own symbol and timeframe.
    await page.getByTestId('chart-layout').click();
    await page.getByTestId('layout-4').click();
    const panes = page.getByTestId('chart-pane');
    await expect(panes).toHaveCount(4);
    await expect(page.getByTestId('price-chart')).toHaveCount(4);
    await expect(panes.first()).toHaveAttribute('data-focused', 'true');
    // Draw on the focused chart: the drawing stays with that chart when focus moves on.
    await page.getByTestId('tool-ray').click();
    const c0 = (await panes.first().getByTestId('price-chart').boundingBox())!;
    await page.mouse.click(c0.x + 80, c0.y + 60);
    await page.getByTestId('tool-cursor').click();
    await expect(panes.first().locator('.drawing')).toHaveCount(1);
    await panes.nth(3).getByTestId('pane-symbol').selectOption('LINK');
    await panes.nth(3).getByTestId('pane-tf').selectOption('5m');
    await expect(panes.nth(3).locator('.watermark')).toHaveText('LINK/USDT · 5m');

    // Click a pane to focus it: the ticket and book now trade LINK, and the tab follows.
    await panes.nth(3).getByTestId('price-chart').click({ position: { x: 60, y: 60 } });
    await expect(panes.nth(3)).toHaveAttribute('data-focused', 'true');
    await expect(page.getByTestId('orderbook')).toContainText('LINK/USDT');
    await expect(tabs.nth(1)).toHaveAttribute('data-symbol', 'LINK');
    await expect(panes.first().locator('.drawing')).toHaveCount(1);

    // Layout, panes and focus survive a reload; other tabs keep their own single chart.
    await page.reload();
    await expect(page.getByTestId('chart-pane')).toHaveCount(4);
    await expect(page.getByTestId('chart-pane').nth(3)).toHaveAttribute('data-symbol', 'LINK');
    await expect(page.getByTestId('orderbook')).toContainText('LINK/USDT');
    await tabs.first().click();
    await expect(page.getByTestId('chart-pane')).toHaveCount(0);
    await expect(page.getByTestId('orderbook')).toContainText('BTC/USDT');
  });

  test('Studio is a separate installable app (F4) that shares its library with the terminal live', async ({ page }) => {
    await freshTerminal(page);
    // Compact top bar: no Studio / Appearance / Account words — Account is an icon.
    // Page tabs live in the bottom bar; no Studio / Appearance / Account words there — Account is the menu icon.
    await expect(page.locator('.bb-nav').getByRole('link')).toHaveText(['Terminal', 'Data & Discovery', 'On-chain', 'Community', 'OTC Desk']);
    await expect(page.getByTestId('account-menu')).toHaveText('');

    // F4 opens Studio in its own window, like MetaEditor next to MT5.
    const [studio] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('F4')]);
    await expect(studio).toHaveURL(/\/studio\.html$/);
    await expect(studio).toHaveTitle('Aztex Studio');
    await expect(studio.locator('link[rel="manifest"]')).toHaveAttribute('href', '/studio.webmanifest');
    await expect(studio.getByTestId('studio-install')).toBeVisible();

    // Save an indicator in Studio → it's in the terminal's Indicator menu without reloading.
    await studio.getByTestId('new-indicator').click();
    await studio.getByTestId('ind-name').fill('Cross-window');
    await studio.getByTestId('ind-formula').fill('close - open');
    await studio.getByTestId('ind-save').click();
    await page.bringToFront();
    await page.getByTestId('add-indicator').click();
    await expect(page.getByTestId('my-indicator').filter({ hasText: 'Cross-window' })).toBeVisible();
    await page.keyboard.press('Escape');

    // The install manifest is a real app manifest.
    const manifest = await (await page.request.get('/studio.webmanifest')).json();
    expect(manifest.name).toBe('Aztex Studio');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

    // Download page from the top bar's Studio menu; Account through its icon.
    await page.getByTestId('studio-menu').click();
    await page.getByTestId('get-studio').click();
    await expect(page).toHaveURL(/\/get-studio$/);
    await expect(page.getByTestId('studio-download')).toContainText('Install Studio');
    await page.getByTestId('account-menu').click();
    await expect(page.getByTestId('account-menu-panel')).toContainText('Demo trader');
    await page.getByTestId('menu-account').click();
    await expect(page).toHaveURL(/\/account$/);
  });
});

test.describe('TradingView-style chart tools', () => {
  const plot = async (page: Page) => {
    const chart = page.getByTestId('price-chart');
    const box = (await chart.boundingBox())!;
    return { chart, box, w: box.width - 78, h: box.height - 22 };
  };

  test('drawing toolbar: select, move, delete, undo, lock, hide, brush, measure, remove all', async ({ page }) => {
    await freshTerminal(page);
    const { chart, box, w, h } = await plot(page);
    await expect(page.getByTestId('drawing-toolbar')).toBeVisible();

    // Horizontal line, then select it with the cross: handles show, Del removes, Ctrl+Z brings it back.
    await page.getByTestId('tool-ray').click();
    const y = box.y + h * 0.5;
    await page.mouse.click(box.x + w * 0.3, y);
    await expect(chart.locator('.drawing')).toHaveCount(1);
    await page.getByTestId('tool-cursor').click();
    await page.mouse.click(box.x + w * 0.6, y);
    await expect(chart.getByTestId('drawing-selected')).toHaveCount(1);
    await page.keyboard.press('Delete');
    await expect(chart.locator('.drawing')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(chart.locator('.drawing')).toHaveCount(1);

    // Drag it to a new price.
    const before = (await chart.locator('.drawing-label').textContent())!;
    await page.mouse.move(box.x + w * 0.6, y);
    await page.mouse.down();
    await page.mouse.move(box.x + w * 0.6, y + 40, { steps: 5 });
    await page.mouse.up();
    await expect(chart.locator('.drawing-label')).not.toHaveText(before);

    // Locked drawings can't be selected or deleted.
    await page.getByTestId('toggle-lock').click();
    await page.mouse.click(box.x + w * 0.6, y + 40);
    await expect(chart.getByTestId('drawing-selected')).toHaveCount(0);
    await page.keyboard.press('Delete');
    await expect(chart.locator('.drawing')).toHaveCount(1);
    await page.getByTestId('toggle-lock').click();

    // Hide / show all.
    await page.getByTestId('toggle-hide').click();
    await expect(chart.locator('.drawing')).toHaveCount(0);
    await page.getByTestId('toggle-hide').click();
    await expect(chart.locator('.drawing')).toHaveCount(1);

    // Brush stroke.
    await page.getByTestId('tool-brush').click();
    await page.mouse.move(box.x + w * 0.2, box.y + h * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + w * 0.3, box.y + h * 0.22, { steps: 6 });
    await page.mouse.move(box.x + w * 0.4, box.y + h * 0.34, { steps: 6 });
    await page.mouse.up();
    await expect(chart.locator('.drawing-brush')).toHaveCount(1);

    // Measure: drag → price / % / bars readout; the tool returns to the cross.
    await page.getByTestId('tool-measure').click();
    await page.mouse.move(box.x + w * 0.5, box.y + h * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + w * 0.7, box.y + h * 0.4, { steps: 6 });
    await page.mouse.up();
    await expect(chart.getByTestId('ruler-label')).toContainText(/%\) · \d+ bars, /);
    await expect(page.getByTestId('tool-cursor')).toHaveAttribute('aria-pressed', 'true');

    // Trash › remove all drawings.
    await page.getByTestId('remove-drawings').click();
    await page.getByTestId('remove-all-drawings').click();
    await expect(chart.locator('.drawing')).toHaveCount(0);
  });

  test('right-click quick actions, object tree, trade-at-the-mouse keys and the shortcuts sheet', async ({ page }) => {
    await freshTerminal(page);
    const { chart, box, w, h } = await plot(page);
    const at = { x: Math.round(w * 0.5), y: Math.round(h * 0.9) };
    await chart.click({ button: 'right', position: at });
    const ctx = page.getByTestId('chart-context-menu');
    await expect(ctx).toContainText('Copy price');
    await expect(ctx).toContainText('Add alert on BTC at');
    await expect(page.getByTestId('ctx-buy')).toHaveText(/Buy [\d.]+ BTC @ [\d,.]+ (limit|stop)/);
    await expect(page.getByTestId('ctx-sell')).toHaveText(/Sell [\d.]+ BTC @ [\d,.]+ (limit|stop)/);

    // Alert at that price: a line + tag on the chart.
    await page.getByTestId('ctx-alert').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Alert set' })).toBeVisible();
    await expect(chart.getByTestId('chart-alert')).toHaveCount(1);

    // One click buys at that price — a limit below the market or a stop above it — and it's working.
    await chart.click({ button: 'right', position: at });
    await page.getByTestId('ctx-buy').click();
    await expect(page.getByTestId('blotter-open-row')).toHaveCount(1);

    // Add order… loads the ticket with a limit there.
    await chart.click({ button: 'right', position: at });
    await page.getByTestId('ctx-ticket').click();
    await expect(page.getByRole('button', { name: 'Limit', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // Object tree: everything on the chart, with remove buttons.
    await chart.click({ button: 'right', position: at });
    await page.getByTestId('ctx-objects').click();
    const tree = page.getByTestId('object-tree');
    await expect(tree).toContainText('Alerts 1');
    await expect(tree.getByTestId('ot-indicator')).toHaveCount(3);
    await tree.getByRole('button', { name: /Remove alert/ }).click();
    await expect(chart.getByTestId('chart-alert')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(tree).toHaveCount(0);

    // Alt+A: alert at the price under the mouse.
    await page.mouse.move(box.x + at.x, box.y + h * 0.2);
    await page.keyboard.press('Alt+KeyA');
    await expect(chart.getByTestId('chart-alert')).toHaveCount(1);

    // ? opens the shortcuts sheet.
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByTestId('shortcuts')).toContainText('Trade at the mouse');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts')).toHaveCount(0);
  });

  test('pages in the bottom bar; account menu with density, System/Dark/Light and new tab', async ({ page }) => {
    await freshTerminal(page);
    const nav = page.locator('.bb-nav');
    await nav.getByRole('link', { name: 'On-chain' }).click();
    await expect(page).toHaveURL(/\/onchain$/);
    await expect(nav.getByRole('link', { name: 'On-chain' })).toHaveClass(/active/);
    await nav.getByRole('link', { name: 'Terminal' }).click();

    await page.getByTestId('account-menu').click();
    const panel = page.getByTestId('account-menu-panel');
    await expect(panel).toContainText('25,000.00 USDT');
    await panel.getByRole('group', { name: 'Layout density' }).getByRole('button', { name: 'Desktop' }).click();
    await expect(page.locator('.app')).toHaveAttribute('data-platform', 'terminal');
    await page.getByTestId('theme-system').click();
    await expect(page.getByTestId('theme-system')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('menu-new-tab').click();
    await page.getByTestId('new-tab-ADA').click();
    await expect(page.getByTestId('chart-tab').last()).toHaveAttribute('data-symbol', 'ADA');
  });
});
