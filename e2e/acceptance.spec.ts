import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Skip the once-per-session brand intro in tests.
  await page.addInitScript(() => sessionStorage.setItem('aztex.intro', '1'));
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
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(bg).not.toBe(dark);
    // CLI bar stays a literal dark terminal in light mode.
    const cliBg = await page.getByTestId('cli').evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = cliBg.match(/\d+(\.\d+)?/g)!.map(Number);
    expect(Math.max(r, g, b)).toBeLessThan(20);
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

  test('changing the bullish color updates the live chart without reload', async ({ page }) => {
    await page.goto('/appearance');
    await page.getByTestId('color-bull').fill('#1144ff');
    await page.getByRole('link', { name: 'Terminal' }).click();
    await expect(page.getByTestId('price-chart').locator('rect[fill="#1144ff"]').first()).toBeAttached();
  });
});

test('panels reorder by dragging their header and the layout persists', async ({ page }) => {
  await page.goto('/terminal');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/terminal');
  const order = () => page.locator('.tile').evaluateAll((els) => els.sort((a, b) => Number((a as HTMLElement).style.order) - Number((b as HTMLElement).style.order)).map((e) => (e as HTMLElement).dataset.panel));
  expect((await order())[0]).toBe('watchlist');
  await page.locator('[data-panel="tape"] .panel-title').dragTo(page.locator('[data-panel="watchlist"] .panel-title'));
  expect((await order())[0]).toBe('tape');
  await page.reload();
  expect((await order())[0]).toBe('tape');
});
