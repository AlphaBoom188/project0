// Net Worth performance card in the LIFF app: the card renders with a
// Chart.js canvas, range pills refetch and redraw, Value | Return switches the
// datasets, benchmark cards are filled, the theme change redraws with the dark
// tokens, the Home "Investments" card opens Net Worth, and with the Chart.js
// CDN blocked everything but the chart still renders ("Chart unavailable").
const { BASE, OUTPUT, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_perf_chart';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const daysAgo = (n) => new Date(Date.now() + 7 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);

async function cleanup() {
  for (const t of ['asset_lots', 'asset_holdings', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

async function openApp(browser, { blockChart = false } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Perf Chart Test', pictureUrl: '' }) };` }));
  if (blockChart) await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  return { page, errors };
}

const chartState = (page) => page.evaluate(() => {
  const chart = window.Chart && window.Chart.getChart(document.getElementById('perf-chart'));
  return chart ? { labels: chart.data.labels, datasets: chart.data.datasets.map((d) => ({ label: d.label, color: d.borderColor, dash: d.borderDash || null })), id: chart.id } : null;
});

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Perf Chart Test' }) });
  const gold = await api(`/portfolio/${U}`, { method: 'POST', body: JSON.stringify({ asset_type: 'gold', symbol: 'GOLD-BAHT', quantity: 1, average_cost: 40000, current_price: 42000, trade_date: daysAgo(200) }) });
  await api(`/portfolio/${U}/${gold.body.holding.id}/lots`, { method: 'POST', body: JSON.stringify({ side: 'buy', quantity: 1, price: 41000, trade_date: daysAgo(15) }) });
  const ptt = await api(`/portfolio/${U}`, { method: 'POST', body: JSON.stringify({ asset_type: 'stock', symbol: 'PTT.BK', quantity: 100, average_cost: 32, trade_date: daysAgo(150) }) });
  // Fixed fresh prices so opening Net Worth doesn't auto-refresh from Yahoo.
  await db.from('asset_holdings').update({ current_price: 35, previous_close: 34, priced_at: new Date().toISOString() }).eq('id', ptt.body.holding.id);
  const expected = (await api(`/portfolio/${U}/performance?range=1y`)).body;

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const { page, errors } = await openApp(browser);

  // --- Home investments card -> Net Worth ---
  await page.waitForSelector('#home-investments-card:not([hidden])', { timeout: 15000 });
  const homeText = (await page.textContent('#home-investments-card')).replace(/\s+/g, ' ');
  assert(homeText.includes('Investments') && homeText.includes('฿87,500.00') && homeText.includes('+฿100.00'), `Home investments card: total + today's gain (got "${homeText.trim()}")`);
  await page.click('#home-investments-card');
  await page.waitForSelector('#tab-networth:not([hidden])');
  assert(await page.isVisible('#tab-networth:not([hidden])') && await page.isVisible('.nav-tab[data-tab="money"].active'), 'tapping it switches to Wealth (Money lit)');

  // --- Card + chart ---
  await page.waitForSelector('#perf-card:not([hidden])', { timeout: 20000 });
  await page.waitForFunction(() => window.Chart && window.Chart.getChart(document.getElementById('perf-chart')), null, { timeout: 15000 });
  assert(await page.isVisible('#perf-chart'), 'performance card renders a canvas');
  assert((await page.textContent('#perf-total-value')) === '฿87,500.00', `big total value in ฿ (got "${await page.textContent('#perf-total-value')}")`);
  const gains = await page.$$eval('.perf-gain-value', (cells) => cells.map((c) => c.textContent));
  assert(gains[0] === '+฿100.00 (+0.11%)' && /^[+-]฿/.test(gains[1]) && /^[+-]฿[\d,.]+ \([+-][\d.]+%\)$/.test(gains[2]), `Today / Yesterday / All gain row (got ${JSON.stringify(gains)})`);
  let chart = await chartState(page);
  assert(chart.datasets.map((d) => d.label).join() === 'Portfolio,Invested' && chart.datasets[1].dash, `Value view: portfolio vs dashed invested (got ${JSON.stringify(chart.datasets)})`);
  assert(chart.labels.length === expected.points.length && chart.labels[0] === expected.start_date, `1Y chart has the endpoint's points (got ${chart.labels.length})`);
  const accentLight = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim());
  assert(chart.datasets[0].color === accentLight, 'portfolio line uses --brand (Clay)');

  const bench = async (id) => (await page.textContent(`#perf-benchmark-${id}`)).replace(/\s+/g, ' ').trim();
  assert(/S&P 500 [\d,]+\.\d\d [+-][\d.]+% today · [+-][\d.]+% 1Y/.test(await bench('sp500')), `S&P 500 card: level, day %, range % (got "${await bench('sp500')}")`);
  assert(/SET [\d,]+\.\d\d [+-][\d.]+% today · [+-][\d.]+% 1Y/.test(await bench('set')), `SET card (got "${await bench('set')}")`);

  // --- Range pill refetches + redraws ---
  const [rangeResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/performance?range=1m'), { timeout: 20000 }),
    page.click('[data-perf-range="1m"]'),
  ]);
  assert(rangeResponse.status() === 200, '1M pill fetches range=1m');
  await page.waitForFunction(() => window.Chart.getChart(document.getElementById('perf-chart')).data.labels.length <= 32, null, { timeout: 10000 });
  chart = await chartState(page);
  assert(chart.labels.length >= 28 && chart.labels.length <= 32 && chart.labels[0] === daysAgo(chart.labels.length - 1), `chart redrawn with ~31 daily points (got ${chart.labels.length})`);
  assert(await page.isVisible('[data-perf-range="1m"].active') && !(await page.isVisible('[data-perf-range="1y"].active')), 'active pill follows the range');
  assert((await bench('sp500')).endsWith('1M'), 'benchmark range change relabelled 1M');

  // --- Value | Return ---
  await page.click('[data-perf-view="return"]');
  chart = await chartState(page);
  assert(chart.datasets.map((d) => d.label).join() === 'Portfolio,S&P 500,SET', `Return view: TWR vs S&P 500 vs SET (got ${chart.datasets.map((d) => d.label)})`);
  const pillBox = await page.$eval('[data-perf-range="ytd"]', (b) => b.getBoundingClientRect().height);
  const toggleBox = await page.$eval('[data-perf-view="value"]', (b) => b.getBoundingClientRect().height);
  assert(pillBox >= 44 && toggleBox >= 44, `range pills and toggle are >= 44px tall (got ${pillBox}, ${toggleBox})`);
  // All 8 range pills fit the card with no sideways scroll, labels unclipped, down to a 360px phone.
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    const fit = await page.$eval('.perf-range-pills', (row) => {
      const box = row.getBoundingClientRect();
      const pills = [...row.querySelectorAll('.range-pill')];
      return {
        overflow: row.scrollWidth - row.clientWidth,
        inside: pills.every((p) => { const b = p.getBoundingClientRect(); return b.left >= box.left - 0.5 && b.right <= box.right + 0.5; }),
        clipped: pills.filter((p) => p.scrollWidth > p.clientWidth).map((p) => p.textContent),
        minWidth: Math.min(...pills.map((p) => p.getBoundingClientRect().width)),
      };
    });
    assert(fit.overflow <= 0 && fit.inside && fit.clipped.length === 0 && fit.minWidth >= 30,
      `at ${width}px all 8 range pills fit, no scroll, no clipped label (got ${JSON.stringify(fit)})`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // The Performance pills share the .range-pill class with the Transactions range row;
  // tapping them must not touch the Transactions range (it used to reset it to undefined).
  const txnActive = await page.$$eval('.range-pill[data-range].active', (ps) => ps.map((p) => p.dataset.range));
  assert(txnActive.length === 1 && txnActive[0] === 'cycle', `Transactions range untouched by Performance pills (got ${JSON.stringify(txnActive)})`);
  await page.$eval('#perf-card', (c) => c.scrollIntoView());
  await page.screenshot({ path: `${OUTPUT}/performance_light.png` });

  // --- Theme change redraws with the dark tokens ---
  const lightText = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim());
  await page.evaluate(() => setTheme('dark'));
  const darkChart = await chartState(page);
  const darkText = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim());
  assert(darkChart.id !== chart.id && darkChart.datasets[2].color === darkText && darkText !== lightText, `theme change re-creates the chart with dark token colors (SET line ${darkChart.datasets[2].color})`);
  await page.$eval('#perf-card', (c) => c.scrollIntoView());
  await page.screenshot({ path: `${OUTPUT}/performance_dark.png` });
  await page.evaluate(() => setTheme('system'));

  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await page.context().close();

  // --- Chart.js blocked: everything but the chart ---
  const blocked = await openApp(browser, { blockChart: true });
  await openTab(blocked.page, 'networth');
  await blocked.page.waitForSelector('#perf-card:not([hidden])', { timeout: 20000 });
  await blocked.page.waitForFunction(() => document.getElementById('perf-note').textContent === 'Chart unavailable', null, { timeout: 10000 }).catch(() => {});
  assert((await blocked.page.textContent('#perf-note')) === 'Chart unavailable' && (await blocked.page.isHidden('#perf-chart-wrap')), 'CDN blocked -> "Chart unavailable", no canvas');
  assert((await blocked.page.textContent('#perf-total-value')) === '฿87,500.00' && /\d/.test(await blocked.page.textContent('#perf-benchmark-sp500 .perf-benchmark-level')), 'total, gains and benchmark cards still render without Chart.js');
  await blocked.page.click('[data-perf-view="return"]');
  await blocked.page.click('[data-perf-range="3m"]');
  await blocked.page.waitForTimeout(500);
  assert((await blocked.page.$$('#holdings-list .holding-row')).length === 2, 'the rest of the Net Worth tab still works');
  assert(blocked.errors.length === 0, `no page JS errors without Chart.js (got ${JSON.stringify(blocked.errors)})`);

  await browser.close();
  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
