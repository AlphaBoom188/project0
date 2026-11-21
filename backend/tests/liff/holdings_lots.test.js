// Investment lots in the LIFF app: tapping a holding opens its detail sheet
// (My Holdings card + lots), Add Lot adds a buy and a sell through the real
// form (FIFO realized gain / win rate show up in the card, an oversell shows
// the server's error inline), and the Transactions tab's "Investments" filter
// lists the lots instead of cash transactions.
const { BASE, OUTPUT, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_holdings_lots';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  for (const t of ['asset_lots', 'asset_holdings', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Holdings Lots Test' }) });
  const created = await api(`/portfolio/${U}`, {
    method: 'POST',
    body: JSON.stringify({ asset_type: 'stock', symbol: 'NVDA', name: 'NVIDIA', quantity: 2, average_cost: 100, trade_date: '2026-09-01' }),
  });
  const H = created.body.holding.id;
  // Fixed prices, marked fresh so opening the tab doesn't auto-refresh them from Yahoo.
  await db.from('asset_holdings').update({ current_price: 150, previous_close: 140, priced_at: new Date().toISOString() }).eq('id', H);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Holdings Lots Test', pictureUrl: '' }) };` }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

  await openTab(page, 'networth');
  await page.waitForSelector('#holdings-list .holding-row', { timeout: 15000 });
  const rowText = await page.textContent('#holdings-list .holding-row');
  const rowValue = await page.textContent('#holdings-list .holding-row .holding-value');
  assert(rowValue.startsWith('฿') && rowText.includes('+50.0%') && rowText.includes('· USD') && !rowText.includes('$'), `holding row: THB value, gain %, USD in the meta (got "${rowText.replace(/\s+/g, ' ').trim()}")`);
  const totalLabel = await page.textContent('#portfolio-total-value');
  assert(totalLabel.startsWith('฿'), `portfolio totals labelled in THB (got "${totalLabel}")`);

  const stat = (id) => page.textContent(`#holding-stat-${id}`).then((t) => t.trim());
  await page.click('#holdings-list .holding-row');
  await page.waitForSelector('#holding-detail-modal:not([hidden])');
  await page.waitForSelector('#holding-lots-list .lot-row');
  assert((await stat('day-gain')) === '+$20.00 (+7.14%)', `Day's gain (got "${await stat('day-gain')}")`);
  assert((await stat('total-gain')) === '+$100.00 (+50.00%)', `Total gain (got "${await stat('total-gain')}")`);
  assert((await stat('shares')) === '2' && (await stat('average-cost')) === '$100.00' && /^\$300\.00 \(฿[\d,.]+\)$/.test(await stat('market-value')), 'Shares / Average cost / Market value');
  assert((await stat('realized-gain')) === '+$0.00' && (await stat('win-rate')) === '—' && (await stat('lots')) === '1 open / 0 closed', 'Realized / Win rate / Lots before any sell');

  const addLot = async ({ side, quantity, price, fee }) => {
    await page.click('#holding-add-lot');
    await page.waitForSelector('#lot-modal:not([hidden])');
    await page.click(`[data-lot-side="${side}"]`);
    await page.fill('#lot-field-quantity', String(quantity));
    if (price !== undefined) await page.fill('#lot-field-price', String(price));
    if (fee !== undefined) await page.fill('#lot-field-fee', String(fee));
    await page.click('#lot-submit');
  };

  // Buy 1 @ 120 (cost/share prefilled with the current price first).
  await page.click('#holding-add-lot');
  await page.waitForSelector('#lot-modal:not([hidden])');
  assert((await page.inputValue('#lot-field-price')) === '150', `cost/share prefilled with the current price (got "${await page.inputValue('#lot-field-price')}")`);
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  assert((await page.inputValue('#lot-field-date')) === today, 'date defaults to today (Bangkok)');
  const fontSizes = await page.$$eval('#lot-form input', (inputs) => inputs.map((i) => getComputedStyle(i).fontSize));
  assert(fontSizes.every((f) => f === '16px'), `lot form inputs render at 16px (got ${fontSizes})`);
  await page.click('#cancel-lot');
  await addLot({ side: 'buy', quantity: 1, price: 120 });
  await page.waitForSelector('#lot-modal', { state: 'hidden', timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#holding-stat-shares').textContent === '3');
  assert((await stat('average-cost')) === '$106.6667' && (await stat('lots')) === '2 open / 0 closed', `after the buy: average cost + lots (got ${await stat('average-cost')}, ${await stat('lots')})`);

  // Sell 2 @ 160, fee 1: FIFO consumes the 2 @ 100 opening lot -> 319 - 200 = +119.
  await addLot({ side: 'sell', quantity: 2, price: 160, fee: 1 });
  await page.waitForSelector('#lot-modal', { state: 'hidden', timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#holding-stat-shares').textContent === '1');
  assert((await stat('realized-gain')) === '+$119.00', `FIFO realized gain in the card (got "${await stat('realized-gain')}")`);
  assert((await stat('win-rate')) === '100.00%' && (await stat('lots')) === '1 open / 1 closed', `win rate + lots after the sell (got ${await stat('win-rate')}, ${await stat('lots')})`);
  const lotRows = await page.$$eval('#holding-lots-list .lot-row', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  assert(lotRows.length === 3 && lotRows[0].includes('Sell NVDA') && lotRows[0].includes('2 shares • $160.00') && lotRows[0].includes('$319.00'), `lot list newest first with badge, shares • price, total (got ${JSON.stringify(lotRows[0])})`);
  assert(lotRows.some((r) => r.includes('Closed')), 'the consumed buy lot shows as Closed');

  // Oversell -> the server's validation error inline, sheet stays open.
  await addLot({ side: 'sell', quantity: 5, price: 160 });
  await page.waitForSelector('#lot-modal-error:not([hidden])', { timeout: 10000 });
  assert((await page.textContent('#lot-modal-error')).includes('exceeds'), `oversell error shown inline (got "${await page.textContent('#lot-modal-error')}")`);
  await page.click('#cancel-lot');

  // Tapping a lot opens it for editing.
  await page.click('#holding-lots-list .lot-row');
  await page.waitForSelector('#lot-modal:not([hidden])');
  assert((await page.textContent('#lot-submit')) === 'Save Lot' && !(await page.isHidden('#lot-delete')), 'tapping a lot opens Edit Lot with Save + Delete');
  await page.click('#cancel-lot');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${OUTPUT}/holding_detail_dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('#close-holding-detail');

  // Transactions tab: the Investments filter lists lots, grouped by trade date.
  await page.click('.nav-tab[data-tab="transactions"]');
  await page.selectOption('#txn-filter-type', 'investments');
  await page.click('.range-pill[data-range="all"]');
  await page.waitForFunction(() => document.querySelectorAll('#txn-full-list .lot-badge').length === 3, null, { timeout: 10000 }).catch(() => {});
  const txnRows = await page.$$eval('#txn-full-list .transaction-row', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  assert(txnRows.length === 3 && txnRows.filter((r) => r.startsWith('Buy NVDA')).length === 2 && txnRows[0].startsWith('Sell NVDA'), `Investments lists Buy/Sell lots (got ${JSON.stringify(txnRows)})`);
  assert(txnRows.some((r) => r.includes('2 shares • $100.00') && r.includes('$200.00')), 'opening lot row: shares • price and total');
  const headers = await page.$$eval('#txn-full-list .transaction-day-header', (h) => h.map((x) => x.textContent.trim()));
  assert(headers.length === 2 && headers[0] === 'Today', `grouped under day headers (got ${JSON.stringify(headers)})`);
  await page.click('#txn-data-button');
  assert(await page.isHidden('#txn-export-row'), 'CSV export hidden for investments (in the Export and import sheet)');
  await page.click('#data-close');
  await page.click('.range-pill[data-range="cycle"]');
  await page.waitForFunction(() => document.querySelectorAll('#txn-full-list .lot-badge').length === 2, null, { timeout: 10000 }).catch(() => {});
  assert((await page.$$('#txn-full-list .lot-badge')).length === 2, 'the date range filters lots by trade_date (Sept opening lot outside this cycle)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${OUTPUT}/transactions_investments_dark.png` });

  await page.selectOption('#txn-filter-type', '');
  await page.waitForSelector('#txn-export-row:not([hidden])', { state: 'attached', timeout: 10000 });
  await page.click('#txn-data-button');
  assert(!(await page.isHidden('#txn-export-row')), 'switching back to cash transactions shows the export row again');
  await page.click('#data-close');

  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await browser.close();
  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
