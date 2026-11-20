import { expect, test, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Skip the once-per-session brand intro in tests (in every window, incl. Studio / pop-ups).
  await page.context().addInitScript(() => sessionStorage.setItem('aztex.intro', '1'));
  // The light project starts every fresh profile in the light theme.
  if (test.info().project.metadata?.theme === 'light')
    await page.context().addInitScript(() => {
      if (!localStorage.getItem('aztex.theme')) localStorage.setItem('aztex.theme', JSON.stringify({ state: { theme: 'light', followSystem: false }, version: 4 }));
    });
});

/** The terminal opens on the Monitoring layout; most tests trade, so they switch to the Trading tab. */
async function toTrading(page: Page) {
  await page.locator('[data-testid="ws-tab"][data-name="Trading"]').click();
  await expect(page.getByTestId('ticket')).toBeVisible();
}

async function freshTerminal(page: Page, tab: 'Trading' | 'Monitoring' = 'Trading') {
  await page.goto('/terminal');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/terminal');
  await expect(page.getByTestId('price-chart')).toBeVisible();
  if (tab === 'Trading') await toTrading(page);
  if (test.info().project.metadata?.theme === 'light') await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}

/** Available balance, read from the wallet menu in the top bar. */
const balance = async (page: Page) => {
  const open = await page.getByTestId('wallet-panel').isVisible();
  if (!open) await page.getByTestId('wallet-menu').click();
  const v = Number((await page.getByTestId('wallet-balance').innerText()).replace(/,/g, ''));
  if (!open) await page.getByTestId('wallet-menu').click();
  return v;
};

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
  });

  test('commands from the top search drive real app state from any route', async ({ page }) => {
    await freshTerminal(page);
    await expect(page.getByTestId('cli')).toHaveCount(0); // no command bar at the bottom any more
    await page.getByRole('link', { name: 'OTC Desk' }).click();
    const search = page.getByRole('combobox', { name: 'Search symbols, windows and commands' });
    const run = async (line: string) => {
      await page.keyboard.press('/');
      await search.fill(line);
      await search.press('Enter');
    };
    await run('buy 0.5 eth');
    await expect(page.getByTestId('toast').last()).toContainText('BUY 0.5');
    await run('theme light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await run('frobnicate');
    await expect(page.getByTestId('toast').last()).toContainText('Not a command');
    await page.getByTestId('rail-terminal').click();
    await expect(page.getByTestId('position-row')).toHaveCount(1);
    await expect(page.locator('[data-testid="chart-window"][data-focused="true"]')).toHaveAttribute('data-symbol', 'ETH');
    await run('close all');
    await expect(page.getByTestId('position-row')).toHaveCount(0);
  });
});

test('order flow: tape prints, flow stats, depth + heatmap views, volume profile, TWAP', async ({ page }) => {
  await freshTerminal(page);
  // Order-flow tools are windows you add to a workspace (the Trading layout keeps them out).
  await expect(page.getByTestId('tape')).toHaveCount(0);
  await page.getByTestId('add-window').click();
  await page.getByTestId('add-tape').click();
  await expect(page.getByTestId('tape-row').first()).toBeVisible();
  await page.getByTestId('add-window').click();
  await page.getByTestId('add-flow').click();
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
  await page.evaluate(() => localStorage.clear());
  await page.goto('/discovery');
  // Discovery is a docked workspace too: Currency search is a tab beside Market share.
  await winTab(page, 'Currency search').click();
  await page.getByTestId('currency-search').fill('dog');
  await page.getByTestId('search-result-DOGE').click();
  await winTab(page, 'Market share').click();
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
    await freshTerminal(page);
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

/** A window's tab in a stack header, by title or by type and link group. */
const winTab = (page: Page, title: string) => page.getByTestId('win-tab').filter({ hasText: title }).first();
const tabOf = (page: Page, type: string, link?: string) => page.locator(`[data-testid="win-tab"][data-type="${type}"]${link ? `[data-link="${link}"]` : ''}`).first();
/** The link dot on a window's tab. */
const linkDot = (page: Page, type: string, link?: string) => page.locator('.flexlayout__tab_button', { has: tabOf(page, type, link) }).getByTestId('link-dot');

/** The stacks (windows sharing a header), each as its tab titles in order. */
const stacksOf = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dock-host .flexlayout__tabset')]
      .map((ts) => [...ts.querySelectorAll('[data-testid="win-tab"]')].map((t) => t.firstChild?.textContent?.trim() ?? ''))
      .filter((s) => s.length),
  );

/** Drags a window by its tab onto another window: its centre stacks it, an edge splits beside it. */
async function dragWindow(page: Page, tab: string | Locator, target: Locator, where: 'center' | 'left' | 'right' | 'top' | 'bottom') {
  const tb = (await (typeof tab === 'string' ? winTab(page, tab) : tab).boundingBox())!;
  const t = (await target.boundingBox())!;
  const [fx, fy] = { center: [0.5, 0.5], left: [0.05, 0.5], right: [0.95, 0.5], top: [0.5, 0.06], bottom: [0.5, 0.94] }[where];
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 30, tb.y + 30, { steps: 5 });
  await page.mouse.move(t.x + t.width * fx, t.y + t.height * fy, { steps: 14 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test.describe('Docked workspace', () => {
  test('the terminal opens on Monitoring: grouped monitor in side-by-side blocks, quote, daily area chart and news, all linked', async ({ page }) => {
    await freshTerminal(page, 'Monitoring');
    await expect(page.locator('[data-testid="ws-tab"][data-name="Monitoring"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('cli')).toHaveCount(0); // no command bar at the bottom

    // The Overview groups flow into two blocks side by side on a wide window, one on a narrow one.
    const groups = page.getByTestId('monitor-groups');
    await expect(groups).toHaveAttribute('data-blocks', '2');
    const blocks = groups.locator('table.mg-block');
    const [a, b] = [(await blocks.nth(0).boundingBox())!, (await blocks.nth(1).boundingBox())!];
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width - 2);
    // Groups collapse to their header and open again.
    const key = page.getByTestId('mon-group-key');
    await expect(key.locator('tr.clickable')).toHaveCount(6);
    await page.getByTestId('mon-group-toggle-key').click();
    await expect(key.locator('tr.clickable')).toHaveCount(0);
    await page.getByTestId('mon-group-toggle-key').click();
    await expect(key.locator('tr.clickable')).toHaveCount(6);

    // A daily area chart with no order-ticket levels (this layout has no ticket).
    const chart = page.getByTestId('chart-window');
    await expect(chart.getByTestId('chart-mode')).toHaveValue('area');
    await expect(chart.getByTestId('tf-1d')).toHaveAttribute('aria-pressed', 'true');
    await expect(chart.locator('text', { hasText: /^(TP|SL)$/ })).toHaveCount(0);

    // Quote: large last price and the key statistics from daily history.
    const quote = page.getByTestId('quote');
    await expect(quote).toHaveAttribute('data-symbol', 'BTC');
    await expect(quote.getByTestId('quote-52w-high')).toContainText(/\d{2} \w{3} \d{2}/);
    await expect(quote.getByTestId('quote-ytd')).toContainText('%');

    // Click a row: quote, chart and the linked news follow it.
    await page.getByTestId('grp-platforms-SOL').click();
    await expect(quote).toHaveAttribute('data-symbol', 'SOL');
    await expect(chart).toHaveAttribute('data-symbol', 'SOL');
    // The symbol-filtered News tab is labelled with it (the whole-wire tab carries no symbol).
    await expect(page.locator('[data-testid="win-tab"][data-type="news"]').filter({ hasText: 'SOL' }).first()).toBeAttached();

    // News: a Time / Headline / Source table with a search box.
    const news = page.getByTestId('news').first();
    await expect(news.locator('.nw-th')).toContainText('Headline');
    await news.getByTestId('news-search').fill('zzzz-nothing');
    await expect(news).toContainText('No stories match');
    await news.getByTestId('news-search').fill('');
    await expect(news.getByTestId('news-story').first()).toBeVisible();

    // Trading is the next tab, with its candles; coming back restores the area chart.
    await toTrading(page);
    await expect(page.getByTestId('chart-window').getByTestId('chart-mode')).toHaveValue('candles');
    await page.locator('[data-testid="ws-tab"][data-name="Monitoring"]').click();
    await expect(page.getByTestId('chart-window').getByTestId('chart-mode')).toHaveValue('area');

    // A narrow window: the groups stack into one block.
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(groups).toHaveAttribute('data-blocks', '1');
  });

  test('dragging a splitter resizes both neighbours live and the chart redraws crisply', async ({ page }) => {
    await freshTerminal(page);
    const chart = page.getByTestId('win-chart');
    const book = page.getByTestId('win-orderbook');
    const cb = (await chart.boundingBox())!;
    const bw0 = (await book.boundingBox())!.width;
    const svgW = () => page.getByTestId('price-chart').first().evaluate((s) => Number(s.getAttribute('width')));
    const w0 = await svgW();
    // The vertical splitter on the chart's right edge (between it and the book column).
    const sash = await page.locator('.dock-host .flexlayout__splitter').evaluateAll(
      (els, edge) =>
        els
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.height > 200 && r.width < 12)
          .sort((a, b) => Math.abs(a.x - edge) - Math.abs(b.x - edge))
          .map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 3 }))[0],
      cb.x + cb.width,
    );
    await page.mouse.move(sash.x, sash.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(sash.x + i * 10, sash.y);
    // Live: the chart has already grown before the mouse is released.
    await expect.poll(svgW).toBeGreaterThan(w0 + 40);
    await page.mouse.up();
    expect((await book.boundingBox())!.width).toBeLessThan(bw0 - 40);
    // Crisp: the SVG is exactly its box (1 unit = 1px), never a stretched viewBox.
    const crisp = await page.getByTestId('price-chart').first().evaluate((s) => Number(s.getAttribute('width')) === Math.floor(s.parentElement!.getBoundingClientRect().width) && !s.getAttribute('viewBox'));
    expect(crisp).toBe(true);
    // Windows tile edge to edge: gaps between neighbours are the 4px splitters.
    const gap = (await book.boundingBox())!.x - ((await chart.boundingBox())!.x + (await chart.boundingBox())!.width);
    expect(gap).toBeLessThanOrEqual(8);
  });

  test('a window docks on an edge or stacks as a tab, and drags back out', async ({ page }) => {
    await freshTerminal(page);
    expect(await stacksOf(page)).toEqual([['Monitor'], ['Chart'], ['Blotter'], ['Order book'], ['Order ticket']]);
    // Centre of the chart: the book stacks as a tab beside it.
    await dragWindow(page, 'Order book', page.getByTestId('win-chart'), 'center');
    await expect.poll(() => stacksOf(page)).toContainEqual(['Chart', 'Order book']);
    // Drag it back out onto the ticket's top edge: its own window again, above the ticket.
    await dragWindow(page, 'Order book', page.getByTestId('win-ticket'), 'top');
    await expect.poll(() => stacksOf(page)).toContainEqual(['Order book']);
    expect(await stacksOf(page)).toContainEqual(['Chart']);
    const bookBox = (await page.getByTestId('win-orderbook').boundingBox())!;
    const ticketBox = (await page.getByTestId('win-ticket').boundingBox())!;
    expect(bookBox.y).toBeLessThan(ticketBox.y);
    // Left edge of the monitor: a new column to its left.
    await dragWindow(page, 'Blotter', page.getByTestId('win-monitor'), 'left');
    await expect.poll(async () => (await page.getByTestId('win-blotter').boundingBox())!.x).toBeLessThan((await page.getByTestId('win-monitor').boundingBox())!.x);
    // The arrangement survives a reload.
    const before = await stacksOf(page);
    await page.reload();
    await expect(page.getByTestId('price-chart')).toBeVisible();
    expect(await stacksOf(page)).toEqual(before);
  });

  test('Monitor click changes the symbol in every window of its link group, not in unlinked ones', async ({ page }) => {
    await freshTerminal(page);
    // A second chart, unlinked: it keeps the symbol it showed.
    await page.getByTestId('add-window').click();
    await page.getByTestId('add-chart').click();
    await expect.poll(() => stacksOf(page)).toContainEqual(['Chart', 'Chart']); // stacked as a tab with the first chart
    await page.getByTestId('win-menu').nth(1).click();
    await page.getByTestId('win-menu-panel').getByTestId('link-none').click();
    await dragWindow(page, tabOf(page, 'chart', 'none'), page.getByTestId('win-blotter'), 'right');
    await expect(page.getByTestId('win-chart')).toHaveCount(2);
    const unlinked = page.locator('[data-testid="win-chart"][data-link="none"]').getByTestId('chart-window');
    const linked = page.locator('[data-testid="win-chart"][data-link="red"]').getByTestId('chart-window');
    await expect(unlinked).toHaveAttribute('data-symbol', 'BTC');

    await page.getByTestId('watch-ETH').click();
    await expect(linked).toHaveAttribute('data-symbol', 'ETH');
    await expect(winTab(page, 'Order book')).toContainText('ETH');
    await expect(winTab(page, 'Order ticket')).toContainText('ETH');
    await expect(page.getByTestId('ticket')).toContainText('ETH');
    await expect(page.getByTestId('ob-bid-0')).toBeVisible();
    await expect(unlinked).toHaveAttribute('data-symbol', 'BTC');

    // Put the unlinked chart in the green group: it shows the green group's symbol.
    await linkDot(page, 'chart', 'none').click();
    await page.getByTestId('link-menu').getByTestId('link-green').click();
    await expect(page.locator('[data-testid="win-chart"][data-link="green"]').getByTestId('chart-window')).toHaveAttribute('data-symbol', 'SOL');
    // A group's symbol is shared: picking DOGE in it moves only that group.
    await page.locator('[data-testid="win-chart"][data-link="green"]').getByTestId('chart-symbol').click();
    await page.getByTestId('chart-pick-DOGE').click();
    await expect(page.locator('[data-testid="win-chart"][data-link="green"]').getByTestId('chart-window')).toHaveAttribute('data-symbol', 'DOGE');
    await expect(linked).toHaveAttribute('data-symbol', 'ETH');
    // The book (red) offers to stream its own symbol while green is the active group.
    await expect(page.getByTestId('stream-symbol')).toContainText('Stream ETH');
    await page.getByTestId('stream-symbol').click();
    await expect(page.getByTestId('ob-bid-0')).toBeVisible();
  });

  test('save a layout, reload, restore: same arrangement, sizes, tabs and link groups; templates load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await freshTerminal(page);
    await dragWindow(page, 'Order book', page.getByTestId('win-chart'), 'center');
    await expect.poll(() => stacksOf(page)).toContainEqual(['Chart', 'Order book']);
    await page.getByTestId('layout-menu').click();
    await page.getByTestId('layout-save-as').click();
    await page.getByTestId('layout-name-input').fill('Desk A');
    await page.getByTestId('layout-name-ok').click();
    await expect(page.getByTestId('layout-name')).toHaveText('Desk A');
    await expect(page.locator('[data-testid="ws-tab"][aria-selected="true"]')).toHaveAttribute('data-name', 'Desk A');
    const saved = await stacksOf(page);
    const size = async () => Math.round((await page.getByTestId('win-monitor').boundingBox())!.width);
    const savedW = await size();

    // Change it: close the blotter, unlink the ticket.
    await page.getByTestId('win-menu').nth(2).click();
    await page.getByTestId('win-close').click();
    await expect(page.getByTestId('win-blotter')).toHaveCount(0);
    await expect(page.getByTestId('layout-dirty')).toBeVisible();
    await linkDot(page, 'ticket').click();
    await page.getByTestId('link-menu').getByTestId('link-none').click();

    // Reload keeps the working arrangement; restoring the saved layout brings it back exactly.
    await page.reload();
    await expect(page.getByTestId('win-blotter')).toHaveCount(0);
    await page.getByTestId('layout-menu').click();
    await page.getByTestId('open-layout-Desk A').click();
    await expect(page.getByTestId('win-blotter')).toHaveCount(1);
    expect(await stacksOf(page)).toEqual(saved);
    expect(Math.abs((await size()) - savedW)).toBeLessThanOrEqual(2);
    await expect(page.locator('[data-testid="win-ticket"]')).toHaveAttribute('data-link', 'red');
    await expect(page.getByTestId('layout-dirty')).toHaveCount(0);

    // Reset goes back to the saved layout; the templates open as new tabs without errors.
    await page.getByTestId('ws-new').click();
    await page.getByTestId('open-tpl-research').click();
    await expect(page.getByTestId('ws-tab')).toHaveCount(3); // Monitoring, Desk A, Research
    await expect(page.getByTestId('win-comparison')).toBeVisible();
    await expect(page.getByTestId('win-news')).toBeVisible();
    await page.getByTestId('ws-new').click();
    await page.getByTestId('open-tpl-execution').click();
    await expect(page.getByTestId('win-blotter')).toBeVisible();
    await expect(page.getByTestId('win-monitor')).toBeVisible();
    // Ctrl+1…9 switch tabs.
    await page.keyboard.press('Control+Digit2');
    await expect(page.getByTestId('layout-name')).toHaveText('Desk A');
    await page.keyboard.press('Control+Digit3');
    await expect(page.getByTestId('layout-name')).toHaveText('Research');
    await page.keyboard.press('Control+Digit1');
    await expect(page.getByTestId('layout-name')).toHaveText('Monitoring');
    expect(errors).toEqual([]);
    await expect(page.locator('.err-inline, .err-page')).toHaveCount(0);
  });

  test('every window maximizes and restores (Esc); a window pops out to its own browser window', async ({ page }) => {
    await freshTerminal(page);
    const dock = (await page.getByTestId('dock').boundingBox())!;
    const n = await page.getByTestId('win-maximize').count();
    expect(n).toBe(5);
    // The windows on screen, with their sizes.
    const shown = () => page.evaluate(() => [...document.querySelectorAll('.dock-host .win')].map((w) => w.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => ({ w: r.width, h: r.height })));
    for (let i = 0; i < n; i++) {
      await page.getByTestId('win-maximize').nth(i).click();
      await expect.poll(async () => (await shown()).length).toBe(1);
      const [b] = await shown();
      expect(b.w).toBeGreaterThan(dock.width - 16);
      expect(b.h).toBeGreaterThan(dock.height - 60);
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await shown()).length).toBe(5);
    }
    // Pop out the book: it opens in its own window, sharing the same state.
    const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('win-popout').nth(3).click()]);
    await expect(pop.getByTestId('orderbook')).toBeVisible();
    await expect(page.locator('.dock-host').getByTestId('win-orderbook')).toHaveCount(0); // it lives in the new window now
    await pop.close({ runBeforeUnload: true }); // closing the pop-out docks the window back
    await expect(page.locator('.dock-host').getByTestId('win-orderbook')).toBeVisible();
  });

  test('top search: "/" focuses it; symbols, windows and commands; Ctrl+K palette', async ({ page }) => {
    await freshTerminal(page);
    await page.keyboard.press('/');
    const search = page.getByRole('combobox', { name: 'Search symbols, windows and commands' });
    await expect(search).toBeFocused();
    await search.fill('eth');
    await expect(page.getByTestId('search-results')).toContainText('Ethereum');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="win-chart"][data-link="red"]').getByTestId('chart-window')).toHaveAttribute('data-symbol', 'ETH');

    await page.keyboard.press('/');
    await search.fill('time & sales');
    await page.getByTestId('search-win-tape').click();
    await expect(page.getByTestId('win-tape')).toBeVisible();

    await page.keyboard.press('/');
    await search.fill('buy 0.01 eth');
    await expect(page.getByTestId('search-cmd')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('toast').filter({ hasText: 'BUY 0.01' })).toBeVisible();
    await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: /Positions/ }).click();
    await expect(page.getByTestId('position-row')).toHaveCount(1);

    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-palette')).toHaveCount(0);
  });

  test('dense tables: Monitor columns sort, flash on change, pick columns; Blotter tabs sort too', async ({ page }) => {
    await freshTerminal(page);
    const table = page.getByTestId('monitor-table');
    const rowH = await table.locator('tbody tr').first().evaluate((r) => r.getBoundingClientRect().height);
    expect(Math.round(rowH)).toBe(24);
    const syms = () => table.locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-testid')!.slice(6)));
    await table.getByTestId('sort-chgPct').click();
    const chg = () => table.locator('tbody tr td:nth-child(4)').allInnerTexts();
    const desc = (await chg()).map((t) => parseFloat(t.replace(/[^\d.+-]/g, '')));
    expect([...desc].sort((a, b) => b - a)).toEqual(desc);
    await table.getByTestId('sort-symbol').click();
    await table.getByTestId('sort-symbol').click();
    expect(await syms()).toEqual([...(await syms())].sort());
    // Prices flash on change; numbers are right-aligned monospace.
    await expect(table.locator('td[data-flash]').first()).toBeAttached({ timeout: 6000 });
    const align = await table.locator('tbody tr td.num').first().evaluate((td) => [getComputedStyle(td).textAlign, getComputedStyle(td).fontFamily]);
    expect(align[0]).toBe('right');
    expect(align[1]).toContain('Mono');
    // Column picker.
    await page.getByTestId('mon-columns').click();
    await page.getByTestId('col-vol').click();
    await expect(table.locator('th[data-col="vol"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Named lists: a new list starts empty; add a symbol to it.
    await page.getByTestId('mon-new-list').click();
    await page.keyboard.press('Enter');
    await page.getByTestId('mon-add-input').fill('lin');
    await page.getByTestId('add-LINK').click();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await page.getByTestId('mon-list-main').click();
    await expect(table.locator('tbody tr')).toHaveCount(6);
    // Blotter: open orders sort and cancel all.
    // Two resting bids well under the market, so neither fills while the test runs.
    for (const off of [0.97, 0.96]) {
      await page.getByTestId('ob-bid-4').click();
      const px = Number(await page.getByTestId('limit-price').inputValue());
      await page.getByTestId('limit-price').fill((px * off).toFixed(2));
      await page.getByTestId('place-order').click();
    }
    await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: /Open orders/ }).click();
    await expect(page.getByTestId('blotter-open-row')).toHaveCount(2);
    await page.getByTestId('blotter-open').getByTestId('sort-price').click();
    await page.getByTestId('cancel-all').click();
    await expect(page.getByTestId('blotter-open-row')).toHaveCount(0);
  });
});

test('pro polish: command palette, sparklines, risk panel, countdown, resting-order markers, R multiple', async ({ page }) => {
  await freshTerminal(page);
  await expect(page.getByTestId('price-chart')).toBeVisible();

  // Watchlist sparklines load from provider history.
  await expect(page.getByTestId('watch-BTC').locator('svg.spark path').first()).toBeAttached();
  // Chart: live candle-close countdown; bid / ask and the OHLC readout on the header line.
  await expect(page.getByTestId('candle-countdown')).toContainText(/\d\d:\d\d/);
  await expect(page.locator('.cw-ba')).toContainText('/');
  await expect(page.locator('.cw-readout')).toContainText(/O\s?[\d,.]+\s?H\s?[\d,.]+\s?L\s?[\d,.]+\s?C/);
  // Ticket: pre-trade risk with the default ±3.2% / ±1.6% levels → R:R 2.00.
  await expect(page.getByTestId('risk-rr')).toHaveText('2.00');

  // Resting limit order shows on the chart and in the book.
  await page.getByTestId('ob-bid-4').click();
  await page.getByTestId('place-order').click();
  await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: /Open orders/ }).click();
  await expect(page.getByTestId('blotter-open-row')).toHaveCount(1);
  await expect(page.getByTestId('chart-working-order')).toHaveCount(1);
  await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: /Positions/ }).click();

  // Positions show R multiple.
  await page.keyboard.press('/');
  await page.getByRole('combobox', { name: 'Search symbols, windows and commands' }).fill('buy 0.01 btc');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('position-r').first()).toContainText('R');

  // Command palette: fuzzy jump to a symbol, then add a window.
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByLabel('Command palette search').fill('sol');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('command-palette')).toHaveCount(0);
  await expect(page.getByTestId('chart-window')).toContainText('SOL');
  await page.getByTestId('palette-trigger').click();
  await page.getByLabel('Command palette search').fill('add order flow window');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('win-flow')).toBeVisible();
});

test.describe('Account features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/terminal');
    await page.evaluate(() => localStorage.clear());
  });

  test('Add crypto: pick coin + network, memo shown, simulated deposit credits holdings', async ({ page }) => {
    await page.goto('/terminal');
    await page.getByTestId('wallet-menu').click();
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
    await page.getByTestId('rail-terminal').click();
    await toTrading(page);
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
  test('News window: live headlines with symbol tags, linked-symbol filter, listings and funding strip, calendar', async ({ page }) => {
    await freshTerminal(page);
    // The Research template has a News window in the red group.
    await page.getByTestId('ws-new').click();
    await page.getByTestId('open-tpl-research').click();
    const news = page.getByTestId('news');
    await expect(news).toBeVisible();
    await expect(news.getByTestId('news-story').first()).toBeVisible();
    await expect(news.getByTestId('news-events').getByTestId('news-event').first()).toBeVisible();

    // A symbol tag on a story loads that symbol into every window of the group.
    const tag = news.getByTestId('news-story').locator('.nw-tag').first();
    const sym = (await tag.innerText()).trim();
    await tag.click();
    await expect(page.locator('[data-testid="chart-window"]').first()).toHaveAttribute('data-symbol', sym);

    // Linked only: every story shown is tagged with the linked symbol.
    await news.getByTestId('news-linked-only').click();
    await expect(news.getByTestId('news-linked-only')).toHaveAttribute('aria-pressed', 'true');
    const rows = news.getByTestId('news-story');
    const n = await rows.count();
    for (let i = 0; i < Math.min(n, 8); i++) await expect(rows.nth(i).locator('.nw-tag', { hasText: sym })).toHaveCount(1);

    // The filter is a window setting: it survives a reload.
    await page.reload();
    await expect(page.getByTestId('news-linked-only')).toHaveAttribute('aria-pressed', 'true');

    // Calendar view: economic and crypto events with countdowns and a "now" marker.
    await page.getByRole('group', { name: 'News view' }).getByRole('button', { name: 'Calendar' }).click();
    const cal = page.getByTestId('news-calendar-view');
    await expect(cal.getByTestId('news-event').first()).toBeVisible();
    await expect(cal.getByTestId('news-calendar')).toContainText('Now ·');
    await page.getByRole('group', { name: 'News view' }).getByRole('button', { name: 'Headlines' }).click();
    // The wire restarts on reload, so the linked symbol may have no story yet: show them all.
    await page.getByTestId('news-linked-only').click();
    await expect(page.getByTestId('news-story').first()).toBeVisible();

    // Alt+N: the Trading tab has no News window, so it adds one; pressing it again only brings it forward.
    await toTrading(page);
    await expect(page.locator('.dock-host').getByTestId('win-news')).toHaveCount(0);
    await page.keyboard.press('Alt+KeyN');
    await expect(page.locator('.dock-host').getByTestId('win-news')).toHaveCount(1);
    await expect(page.locator('.dock-host').getByTestId('news')).toBeVisible();
    await page.keyboard.press('Alt+KeyN');
    await expect(page.locator('.dock-host').getByTestId('win-news')).toHaveCount(1);
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
    const blotterTab = (name: RegExp | string) => page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name });
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('position-row')).toHaveCount(1);
    await blotterTab(/Open orders/).click();
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
    // Bracket legs were cancelled with the position; only the resting post-only bid remains.
    await expect(page.getByTestId('blotter-open-row')).toHaveCount(1, { timeout: 4000 });
    await blotterTab(/Positions/).click();
    await expect(page.getByTestId('position-row')).toHaveCount(0);

    // History, fills and execution quality.
    await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: 'Orders', exact: true }).click();
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
    await page.getByTestId('rail-terminal').click();
    await expect(page.getByTestId('onchain-unseen')).toBeVisible({ timeout: 15000 });

    // Live mode switches the search source and says what stays simulated.
    await page.getByRole('link', { name: /On-chain/ }).click();
    await page.getByRole('group', { name: 'Data source' }).getByRole('button', { name: /Live RPC/ }).click();
    await expect(page.getByTestId('oc-mode-badge')).toContainText('live public RPC');
    await page.getByRole('group', { name: 'Data source' }).getByRole('button', { name: 'Simulated' }).click();
  });
});

test.describe('Fit to screen', () => {
  test('the workspace fits a laptop screen: no page scroll, chart, Place and positions on screen; maximize fills the dock; Mobile previews the phone app', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 657 });
    await freshTerminal(page);
    const noScroll = () => page.evaluate(() => {
      const d = document.scrollingElement!;
      return d.scrollHeight <= innerHeight + 1 && d.scrollWidth <= innerWidth + 1;
    });
    await expect.poll(noScroll).toBe(true);
    const vh = 657;
    const boxOf = async (l: Locator) => (await l.boundingBox())!;
    const bottomOf = async (l: Locator) => {
      const b = await boxOf(l);
      return b.y + b.height;
    };
    const chart = page.locator('[data-testid="chart-window"]').first();
    expect(await bottomOf(chart)).toBeLessThanOrEqual(vh);
    expect(await bottomOf(page.getByTestId('place-order'))).toBeLessThanOrEqual(vh);
    expect(await bottomOf(page.getByTestId('blotter-window'))).toBeLessThanOrEqual(vh);
    // The status row stays on screen at the bottom.
    expect(await bottomOf(page.getByTestId('status-bar'))).toBeLessThanOrEqual(vh);

    // A taller window gives the space to the windows, still without page scroll.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect.poll(noScroll).toBe(true);
    await expect.poll(async () => (await boxOf(chart)).height).toBeGreaterThan(450);

    // Maximize the chart: it fills the dock; Esc restores.
    await page.setViewportSize({ width: 1366, height: 657 });
    const dock = await boxOf(page.getByTestId('dock'));
    await page.locator('.flexlayout__tabset', { has: tabOf(page, 'chart', 'red') }).getByTestId('win-maximize').click();
    await expect.poll(async () => (await boxOf(chart)).height).toBeGreaterThan(dock.height - 60);
    expect(await bottomOf(chart)).toBeLessThanOrEqual(vh);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await boxOf(chart)).height).toBeLessThan(dock.height - 100);

    // The Mobile layout previews the phone app in a phone frame; one click goes back.
    await page.getByTestId('account-menu').click();
    await page.getByRole('group', { name: 'Layout density' }).getByRole('button', { name: 'Mobile' }).click();
    await expect(page.getByTestId('phone-preview').getByTestId('mobile-app')).toBeVisible();
    await expect(page.getByTestId('phone-preview').getByTestId('m-chart')).toBeVisible();
    await page.getByTestId('exit-phone-preview').click();
    await expect(page.getByTestId('dock')).toBeVisible();
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

test.describe('Chart windows, layouts & apps', () => {
  test('charts are windows: a new one stacks with the chart, keeps its own symbol, timeframe and drawings, splits off and persists', async ({ page }) => {
    await freshTerminal(page);
    const linked = page.locator('[data-testid="win-chart"][data-link="red"]').getByTestId('chart-window');
    await expect(linked).toHaveAttribute('data-symbol', 'BTC');

    // Palette: DOGE in a new chart window. It opens unlinked, as a tab in the chart's stack, and takes
    // focus. The red group keeps BTC: the ticket still trades it and the book offers to stream it back.
    await page.keyboard.press('Control+KeyK');
    await page.getByLabel('Command palette search').fill('doge in a new chart window');
    await page.getByTestId('command-palette').getByText('DOGE in a new chart window').click();
    const doge = page.locator('[data-testid="win-chart"][data-link="none"]').getByTestId('chart-window');
    await expect(doge).toHaveAttribute('data-symbol', 'DOGE');
    await expect(doge).toHaveAttribute('data-focused', 'true');
    expect((await stacksOf(page)).some((st) => st.filter((t) => t === 'Chart').length === 2)).toBe(true);
    await expect(linked).toHaveAttribute('data-symbol', 'BTC');
    await expect(page.getByTestId('ticket')).toContainText('BTC');
    await expect(page.getByTestId('orderbook')).toContainText('Stream BTC here');

    // Its own timeframe, and a drawing that belongs to it.
    await doge.getByTestId('tf-5m').click();
    await expect(doge.locator('.watermark')).toHaveText('DOGE/USDT · 5m');
    await doge.getByTestId('tool-ray').click();
    const c = (await doge.getByTestId('price-chart').boundingBox())!;
    await page.mouse.click(c.x + 80, c.y + 60);
    await doge.getByTestId('tool-cursor').click();
    await expect(doge.locator('.drawing')).toHaveCount(1);

    // Drag it out of the stack beside the blotter: both charts now show at once.
    await dragWindow(page, tabOf(page, 'chart', 'none'), page.getByTestId('win-blotter'), 'right');
    expect((await stacksOf(page)).some((st) => st.filter((t) => t === 'Chart').length === 2)).toBe(false);
    await expect(linked).toBeVisible();
    await expect(doge).toBeVisible();

    // Focus the red chart: the book follows BTC; DOGE keeps drawing its own candles.
    await linked.getByTestId('price-chart').click({ position: { x: 60, y: 60 } });
    await expect(linked).toHaveAttribute('data-focused', 'true');
    await expect(page.getByTestId('ob-bid-0')).toBeVisible();
    await expect(tabOf(page, 'orderbook', 'red')).toContainText('BTC');
    await expect(doge).toHaveAttribute('data-focused', 'false');
    await expect(doge.locator('.watermark')).toHaveText('DOGE/USDT · 5m');

    // Focusing DOGE again brings its drawing back.
    await doge.getByTestId('price-chart').click({ position: { x: 60, y: 60 } });
    await expect(doge).toHaveAttribute('data-focused', 'true');
    await expect(doge.locator('.drawing')).toHaveCount(1);

    // The windows, their symbols, timeframes and links survive a reload.
    await page.reload();
    await expect(doge).toHaveAttribute('data-symbol', 'DOGE');
    await expect(doge.locator('.watermark')).toHaveText('DOGE/USDT · 5m');
    await expect(linked).toHaveAttribute('data-symbol', 'BTC');

    // Alt+Shift+T opens another chart window on the current symbol.
    await page.keyboard.press('Alt+Shift+KeyT');
    await expect(page.locator('[data-testid="win-chart"][data-link="none"]')).toHaveCount(2);
  });

  test('Studio is a separate installable app (F4) that shares its library with the terminal live', async ({ page }) => {
    await freshTerminal(page);
    // The app rail: icons only, labels as names and tooltips; Account is an icon in the top bar.
    await expect(page.getByTestId('app-rail').getByRole('link')).toHaveCount(6);
    for (const name of ['Terminal', 'Data & Discovery', 'On-chain', 'Community', 'OTC Desk', 'Account'])
      await expect(page.getByTestId('app-rail').getByRole('link', { name, exact: true })).toHaveText('');
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
    await page.locator('[data-testid="chart-window"][data-focused="true"]').getByTestId('add-indicator').click();
    await expect(page.getByTestId('my-indicator').filter({ hasText: 'Cross-window' })).toBeVisible();
    await page.keyboard.press('Escape');

    // The install manifest is a real app manifest.
    const manifest = await (await page.request.get('/studio.webmanifest')).json();
    expect(manifest.name).toBe('Aztex Studio');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

    // Download page and Account from the profile menu.
    await page.getByTestId('account-menu').click();
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
    await page.getByRole('group', { name: 'Blotter view' }).getByRole('button', { name: /Open orders/ }).click();
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

  test('apps in the rail; profile menu with density, System/Dark/Light; new chart window', async ({ page }) => {
    await freshTerminal(page);
    const rail = page.getByTestId('app-rail');
    await rail.getByTestId('rail-onchain').click();
    await expect(page).toHaveURL(/\/onchain$/);
    await expect(rail.getByTestId('rail-onchain')).toHaveClass(/active/);
    await rail.getByTestId('rail-terminal').click();

    await page.getByTestId('account-menu').click();
    const panel = page.getByTestId('account-menu-panel');
    await expect(panel).toContainText('25,000.00 USDT');
    await panel.getByRole('group', { name: 'Layout density' }).getByRole('button', { name: 'Desktop' }).click();
    await expect(page.locator('.shell')).toHaveAttribute('data-platform', 'terminal');
    await page.getByTestId('theme-system').click();
    await expect(page.getByTestId('theme-system')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+KeyK');
    await page.getByLabel('Command palette search').fill('ada in a new chart window');
    await page.getByTestId('command-palette').getByText('ADA in a new chart window').click();
    await expect(page.locator('[data-testid="win-chart"][data-link="none"]').getByTestId('chart-window')).toHaveAttribute('data-symbol', 'ADA');
  });
});

test.describe('Phone app', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function freshPhone(page: Page, path = '/watchlist') {
    await page.goto(path);
    await page.evaluate(() => localStorage.clear());
    await page.goto(path);
    await expect(page.getByTestId('mobile-app')).toBeVisible();
  }

  test('bottom tabs, quotes → chart, MT5 order sheet, position sheet and history', async ({ page }) => {
    await freshPhone(page);
    // Desktop chrome is gone; the five MT5-style tabs are there.
    await expect(page.locator('.app')).toHaveCount(0);
    for (const t of ['quotes', 'chart', 'trade', 'history', 'menu']) await expect(page.getByTestId(`m-tab-${t}`)).toBeVisible();
    // MT5 quotes, Advanced by default: tick time, spread in points, bid over Low, ask over High.
    const btc = page.getByTestId('m-quote-BTC');
    await expect(btc).toContainText(/Spread: \d+/);
    await expect(btc.getByTestId('m-bid')).toContainText('Low:');
    await expect(btc.getByTestId('m-ask')).toContainText('High:');
    await expect(btc.locator('.m-px b')).toHaveCount(2);
    // Simple: symbol, bid and ask under a column header.
    await page.getByTestId('m-quotes-mode').getByRole('button', { name: 'Simple' }).tap();
    await expect(page.locator('.m-quotes-cols')).toContainText('Bid');
    await expect(btc).not.toContainText('Spread');

    // Tap a quote: its full-screen chart.
    await page.getByTestId('m-quote-ETH').tap();
    await expect(page).toHaveURL(/\/terminal$/);
    await expect(page.getByTestId('m-symbol')).toContainText('ETH');
    await expect(page.getByTestId('price-chart')).toBeVisible();
    await page.getByTestId('m-tf-5m').tap();
    await expect(page.getByTestId('m-tf-5m')).toHaveClass(/on/);

    // Buy → order sheet → market order.
    await page.getByTestId('m-buy').tap();
    const sheet = page.getByTestId('m-order-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('m-side-buy')).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByTestId('m-order-preview')).toContainText('Cost');
    const qty = Number(await sheet.getByTestId('m-qty').locator('input').inputValue());
    await sheet.getByRole('button', { name: /Increase Volume/ }).tap();
    await expect.poll(async () => Number(await sheet.getByTestId('m-qty').locator('input').inputValue())).toBeGreaterThan(qty);
    await sheet.getByTestId('m-order-submit').tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.m-tab .m-badge')).toHaveText('1');

    // Trade tab: account + the position; its sheet moves SL / TP and closes it.
    await page.getByTestId('m-tab-trade').tap();
    await expect(page.getByTestId('m-account')).toContainText('Equity');
    await expect(page.getByTestId('m-position')).toHaveCount(1);
    await expect(page.getByTestId('m-position')).toContainText('ETH');
    await page.getByTestId('m-position').tap();
    const pos = page.getByTestId('m-position-sheet');
    await pos.getByRole('button', { name: /Increase Stop loss/ }).tap();
    await pos.getByTestId('m-save-levels').tap();
    await expect(page.locator('.toast').last()).toContainText('Levels updated');
    await pos.getByTestId('m-close-position').tap();
    await expect(pos).toHaveCount(0);
    await expect(page.getByTestId('m-position')).toHaveCount(0);

    // History: the closing deal carries its realized P/L.
    await page.getByTestId('m-tab-history').tap();
    await expect(page.getByTestId('m-history-summary')).toContainText('Profit');
    await expect(page.getByTestId('m-deal')).toHaveCount(2);
    await expect(page.getByTestId('m-deal').first()).toContainText('close');
    await expect(page.getByTestId('m-deal').first().locator('.m-row-pnl')).toHaveText(/^[+-−]?\d/);
  });

  test('quotes: hold a row for its actions; the pencil removes and drag-reorders symbols', async ({ page }) => {
    await freshPhone(page);
    const cdp = await page.context().newCDPSession(page);
    const r = (await page.getByTestId('m-quote-ETH').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + 60, y: r.y + r.height / 2 }] } as never);
    await page.waitForTimeout(650);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] } as never);
    // The sheet stays open after the finger lifts, and the hold doesn't open the chart.
    const sheet = page.getByTestId('m-quote-sheet');
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/watchlist$/);
    await sheet.getByTestId('m-quote-trade').tap();
    await expect(page.getByTestId('m-order-sheet')).toContainText('ETH');
    await page.keyboard.press('Escape');

    await page.getByTestId('m-edit-quotes').tap();
    const order = () => page.locator('.m-edit-row b').allInnerTexts();
    const before = await order();
    await page.getByRole('button', { name: 'Remove XRP' }).tap();
    const left = before.filter((x) => x !== 'XRP');
    expect(await order()).toEqual(left);
    // Drag the first symbol two rows down.
    const h = (await page.getByRole('button', { name: `Drag to reorder ${left[0]}` }).boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 112, { steps: 6 });
    await page.mouse.up();
    await expect.poll(order).toEqual([left[1], left[2], left[0], ...left.slice(3)]);
    await page.getByTestId('m-edit-done').tap();
    await expect(page.getByTestId('m-quotes').locator('li').first()).toHaveAttribute('data-testid', `m-quote-${left[1]}`);
    await expect(page.getByTestId('m-quote-XRP')).toHaveCount(0);
  });

  test('pending orders from the sheet show under Trade and cancel with a tap', async ({ page }) => {
    await freshPhone(page, '/terminal');
    await page.getByTestId('m-sell').tap();
    const sheet = page.getByTestId('m-order-sheet');
    await sheet.getByRole('radio', { name: 'Stop' }).or(sheet.getByRole('button', { name: 'Stop', exact: true })).first().tap();
    await expect(sheet.getByTestId('m-price')).toBeVisible();
    await expect(sheet.getByTestId('m-order-submit')).toContainText('stop @');
    await sheet.getByTestId('m-order-submit').tap();
    await page.getByTestId('m-tab-trade').tap();
    await expect(page.getByTestId('m-order')).toHaveCount(1);
    await expect(page.getByTestId('m-order')).toContainText('sell stop');
    await page.getByTestId('m-order').getByRole('button', { name: /Cancel/ }).tap();
    await expect(page.getByTestId('m-order')).toHaveCount(0);
  });

  test('chart gestures: pinch to zoom, long-press crosshair, tap to clear', async ({ page }) => {
    await freshPhone(page, '/terminal');
    const chart = page.getByTestId('price-chart');
    const box = (await chart.boundingBox())!;
    const bars = async () => Number((await page.locator('.chart-zoom .label').innerText()).replace(/\D/g, ''));
    const before = await bars();
    // Narrow plot: fewer default bars than the desktop's 90.
    expect(before).toBeLessThan(90);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, pts: [number, number][]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) } as never);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx - 30 - i * 12, cy], [cx + 30 + i * 12, cy]]);
    await touch('touchEnd', []);
    await expect.poll(bars).toBeLessThan(before);

    // Long press: crosshair; it stays after lifting, and a tap clears it.
    await touch('touchStart', [[cx - 50, cy + 30]]);
    await page.waitForTimeout(550);
    await touch('touchEnd', []);
    await expect(chart.locator('.crosshair line')).toHaveCount(2);
    await touch('touchStart', [[cx, cy]]);
    await touch('touchEnd', []);
    await expect(chart.locator('.crosshair line')).toHaveCount(0);
  });

  test('chart sheets: symbol search, drawing tools, indicators and chart settings', async ({ page }) => {
    await freshPhone(page, '/terminal');
    await page.getByTestId('m-symbol').tap();
    await page.getByTestId('m-symbol-sheet').getByRole('textbox').fill('sol');
    await page.getByTestId('m-pick-SOL').tap();
    await expect(page.getByTestId('m-symbol')).toContainText('SOL');

    await page.getByTestId('m-tools').tap();
    await page.getByTestId('m-tool-trend').tap();
    await expect(page.getByTestId('m-tool-pill')).toBeVisible();
    await expect(page.getByTestId('m-tools')).toHaveClass(/on/);
    const box = (await page.getByTestId('price-chart').boundingBox())!;
    await page.touchscreen.tap(box.x + box.width * 0.25, box.y + box.height * 0.6);
    await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.3);
    await expect(page.getByTestId('price-chart').locator('.drawing')).toHaveCount(1);
    await page.getByTestId('m-tools').tap();
    await page.getByTestId('m-clear-drawings').tap();
    await expect(page.getByTestId('price-chart').locator('.drawing')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('m-tools-sheet')).toHaveCount(0);

    await page.getByTestId('m-indicators').tap();
    const ind = page.getByTestId('m-indicators-sheet');
    const count = await ind.locator('.m-row').count();
    await ind.getByTestId('m-add-ind-SMA 50').tap();
    await expect(ind.locator('.m-row')).toHaveCount(count + 1);
    await page.keyboard.press('Escape');

    await page.getByTestId('m-chart-settings').tap();
    const settings = page.getByTestId('m-chart-settings-sheet');
    await settings.getByTestId('ctx-chart-type').selectOption('line');
    await settings.getByTestId('preset-classic').tap();
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
  });

  test('menu: account, deposit, desktop pages full screen with a back button, news', async ({ page }) => {
    await freshPhone(page, '/menu');
    await expect(page.getByTestId('m-profile')).toBeVisible();
    await page.getByTestId('m-deposit').tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    for (const [name, url] of [
      ['Markets & discovery', /\/discovery$/],
      ['On-chain', /\/onchain$/],
      ['OTC desk', /\/otc$/],
    ] as const) {
      await page.getByRole('button', { name }).tap();
      await expect(page).toHaveURL(url);
      await expect(page.locator('.m-sub-page')).toBeVisible();
      // No sideways scrolling of the page itself.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.getByTestId('m-back').tap();
      await expect(page).toHaveURL(/\/menu$/);
    }
    await page.getByTestId('m-menu-news').tap();
    await expect(page.getByTestId('news-story').first()).toBeVisible();
    // The feed sits below the screen header (not the desktop dock's overlay).
    const head = (await page.locator('.m-header').boundingBox())!;
    expect((await page.locator('.m-news').boundingBox())!.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
    await page.getByRole('radio', { name: 'Calendar' }).or(page.getByRole('button', { name: 'Calendar', exact: true })).first().tap();
    await expect(page.locator('.nd-ev').first()).toBeVisible();
  });
});
