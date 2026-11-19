// Net Worth dividends card in the LIFF app: the card renders the trailing
// 12-month income, YoY and the metrics grid with a Chart.js bar chart
// (received solid, projected lighter), the Monthly | Quarterly | Annually
// toggle refetches and redraws, the holding detail sheet shows the Dividends
// and next-dividend lines, the theme change redraws, and with the Chart.js
// CDN blocked everything but the chart still renders ("Chart unavailable").
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_div_card';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const baht = (v) => `฿${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function cleanup() {
  for (const t of ['asset_lots', 'asset_holdings', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

async function openApp(browser, { blockChart = false } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Dividend Card Test', pictureUrl: '' }) };` }));
  if (blockChart) await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await page.click('.nav-tab[data-tab="networth"]');
  await page.waitForSelector('#div-card:not([hidden])', { timeout: 20000 });
  return { page, errors };
}

const chartState = (page) => page.evaluate(() => {
  const chart = window.Chart && window.Chart.getChart(document.getElementById('div-chart'));
  return chart ? { type: chart.config.type, labels: chart.data.labels, datasets: chart.data.datasets.map((d) => ({ label: d.label, color: d.backgroundColor, data: d.data })), id: chart.id } : null;
});

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Dividend Card Test' }) });
  const aapl = await api(`/portfolio/${U}`, { method: 'POST', body: JSON.stringify({ asset_type: 'stock', symbol: 'AAPL', quantity: 10, average_cost: 125, trade_date: '2023-01-03' }) });
  await api(`/portfolio/${U}`, { method: 'POST', body: JSON.stringify({ asset_type: 'gold', symbol: 'GOLD-BAHT', quantity: 1, average_cost: 40000, current_price: 42000, trade_date: '2025-06-02' }) });
  // Fixed fresh price so opening Net Worth doesn't auto-refresh from Yahoo.
  await db.from('asset_holdings').update({ current_price: 250, previous_close: 248, priced_at: new Date().toISOString() }).eq('id', aapl.body.holding.id);
  const expected = (await api(`/portfolio/${U}/dividends?mode=monthly`)).body;
  const expectedAapl = expected.holdings.find((h) => h.symbol === 'AAPL');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const { page, errors } = await openApp(browser);

  // --- Card, metrics, chart ---
  await page.waitForFunction(() => window.Chart && window.Chart.getChart(document.getElementById('div-chart')), null, { timeout: 15000 });
  assert(await page.isVisible('#div-chart'), 'dividends card renders a canvas');
  assert((await page.textContent('#div-trailing')) === baht(expected.summary.trailing_12m_thb) && expected.summary.trailing_12m_thb > 0,
    `headline = trailing 12m in ฿ (got "${await page.textContent('#div-trailing')}")`);
  assert(/^[+-][\d.]+% vs the 12 months before$/.test(await page.textContent('#div-yoy')), `YoY line (got "${await page.textContent('#div-yoy')}")`);
  const metrics = await page.$$eval('.div-metrics dd', (cells) => cells.map((c) => c.textContent));
  assert(metrics[0] === `${expected.summary.portfolio_yield_pct.toFixed(2)}%` && metrics[1] === `${expected.summary.yield_on_cost_pct.toFixed(2)}%`
    && metrics[2] === baht(expected.summary.avg_monthly_thb) && metrics[3] === baht(expected.summary.avg_daily_thb), `metrics grid: yield, yield on cost, avg monthly, avg daily (got ${JSON.stringify(metrics)})`);
  let chart = await chartState(page);
  assert(chart.type === 'bar' && chart.datasets.map((d) => d.label).join() === 'Received,Projected', `bar chart, Received / Projected (got ${chart && chart.datasets.map((d) => d.label)})`);
  assert(chart.labels.length === 24 && chart.labels[11] === expected.series[11].label, `24 monthly bars (got ${chart.labels.length})`);
  const income = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-income').trim());
  assert(chart.datasets[0].color === income && /^rgba\(\d+, \d+, \d+, 0\.35\)$/.test(chart.datasets[1].color), `received = --color-income, projected = a lighter version (got ${chart.datasets[0].color}, ${chart.datasets[1].color})`);
  assert(chart.datasets[1].data.slice(12).some((v) => v > 0) && chart.datasets[0].data.slice(0, 11).some((v) => v > 0), 'past bars received, future bars projected');
  const tooltip = await page.evaluate(() => {
    const c = window.Chart.getChart(document.getElementById('div-chart'));
    const cb = c.options.plugins.tooltip.callbacks;
    return { label: cb.label({ dataset: { label: 'Projected' }, raw: 1234.5 }), title: cb.title([{ dataIndex: 0 }]) };
  });
  assert(tooltip.label === 'Projected: ฿1,234.50' && tooltip.title === expected.series[0].label, `tooltip: ฿ to 2 decimals + period label (got ${JSON.stringify(tooltip)})`);
  const note = await page.textContent('#div-note');
  assert(note.includes('Before tax') && note.includes("Crypto, funds and gold aren't included"), `note: before tax + unsupported types (got "${note}")`);
  const toggleHeights = await page.$$eval('[data-div-mode]', (bs) => bs.map((b) => b.getBoundingClientRect().height));
  assert(toggleHeights.length === 3 && toggleHeights.every((h) => h >= 44), `mode buttons >= 44px tall (got ${toggleHeights})`);

  // --- Mode toggle refetches + redraws ---
  const [quarterResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/dividends?mode=quarterly'), { timeout: 20000 }),
    page.click('[data-div-mode="quarterly"]'),
  ]);
  assert(quarterResponse.status() === 200, 'Quarterly fetches mode=quarterly');
  await page.waitForFunction(() => window.Chart.getChart(document.getElementById('div-chart')).data.labels.length === 8, null, { timeout: 10000 });
  chart = await chartState(page);
  assert(/^Q\d \d{4}$/.test(chart.labels[0]) && (await page.isVisible('[data-div-mode="quarterly"].active')) && !(await page.isVisible('[data-div-mode="monthly"].active')), `8 quarterly bars, active button follows (got ${chart.labels})`);
  const [annualResponse] = await Promise.all([page.waitForResponse((r) => r.url().includes('/dividends?mode=annual'), { timeout: 20000 }), page.click('[data-div-mode="annual"]')]);
  const annual = await annualResponse.json();
  await page.waitForFunction(() => window.Chart.getChart(document.getElementById('div-chart')).data.labels[0] === '2023', null, { timeout: 10000 }).catch(() => {});
  chart = await chartState(page);
  const thisYear = String(new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear());
  const yearIndex = chart.labels.indexOf(thisYear);
  assert(chart.labels[0] === '2023' && yearIndex === chart.labels.length - 2, `annual bars from the first lot's year to next year (got ${chart.labels})`);
  // Projected for the rest of this year depends on the calendar: after AAPL's
  // last ex-date of the year (~Nov 10) the next projected payout is next year,
  // so the projected part of this year's bar is legitimately 0 until Jan 1.
  const yearRow = annual.series.find((x) => x.label === thisYear);
  assert(chart.datasets[0].data[yearIndex] > 0 && chart.datasets[0].data[yearIndex] === yearRow.received_thb && chart.datasets[1].data[yearIndex] === yearRow.projected_thb,
    `this year's bar stacks the API's received + projected (received ${chart.datasets[0].data[yearIndex]}, projected ${chart.datasets[1].data[yearIndex]})`);
  const nextYear = String(Number(thisYear) + 1);
  assert(chart.datasets[1].data[chart.labels.indexOf(nextYear)] > 0, 'next year shows projected dividends');
  assert((await page.textContent('#div-trailing')) === baht(expected.summary.trailing_12m_thb), 'headline unchanged across modes');
  await page.$eval('#div-card', (c) => c.scrollIntoView());
  await page.screenshot({ path: `${OUTPUT}/dividends_light.png` });

  // --- Theme change redraws ---
  await page.evaluate(() => setTheme('dark'));
  const dark = await chartState(page);
  const textDark = await page.evaluate(() => window.Chart.getChart(document.getElementById('div-chart')).options.plugins.legend.labels.color);
  const tokenDark = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim());
  assert(dark.id !== chart.id && textDark === tokenDark, `theme change re-creates the chart with dark tokens (legend ${textDark})`);
  await page.$eval('#div-card', (c) => c.scrollIntoView());
  await page.screenshot({ path: `${OUTPUT}/dividends_dark.png` });
  await page.evaluate(() => setTheme('system'));

  // --- Holding detail sheet ---
  await page.locator('#holdings-list .holding-row', { hasText: 'AAPL' }).click();
  await page.waitForSelector('#holding-detail-modal:not([hidden])');
  await page.waitForSelector('#holding-stat-dividends-row:not([hidden])');
  const divLine = await page.textContent('#holding-stat-dividends');
  const usd = `$${expectedAapl.received.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  assert(divLine === `${usd} · ${baht(expectedAapl.received_thb)}`, `detail: Dividends received in USD + ฿ (got "${divLine}", want "${usd} · ${baht(expectedAapl.received_thb)}")`);
  const nextLine = await page.textContent('#holding-stat-next-dividend');
  assert((await page.isVisible('#holding-stat-next-dividend-row')) && /^[A-Z][a-z]{2} \d{1,2} · \$[\d.,]+ \(projected\)$/.test(nextLine), `detail: next projected dividend date + amount (got "${nextLine}")`);
  await page.click('#close-holding-detail');
  await page.locator('#holdings-list .holding-row', { hasText: 'GOLD-BAHT' }).click();
  await page.waitForSelector('#holding-detail-modal:not([hidden])');
  assert((await page.isHidden('#holding-stat-dividends-row')) && (await page.isHidden('#holding-stat-next-dividend-row')), 'gold holding: no Dividends lines');
  await page.click('#close-holding-detail');

  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await page.context().close();

  // --- Chart.js blocked: everything but the chart ---
  const blocked = await openApp(browser, { blockChart: true });
  await blocked.page.waitForFunction(() => document.getElementById('div-note').textContent.includes('Chart unavailable'), null, { timeout: 10000 }).catch(() => {});
  assert((await blocked.page.textContent('#div-note')).includes('Chart unavailable') && (await blocked.page.isHidden('#div-chart-wrap')), 'CDN blocked -> "Chart unavailable", no canvas');
  assert((await blocked.page.textContent('#div-trailing')) === baht(expected.summary.trailing_12m_thb) && (await blocked.page.textContent('#div-avg-monthly')) === baht(expected.summary.avg_monthly_thb),
    'headline and metrics still render without Chart.js');
  await Promise.all([blocked.page.waitForResponse((r) => r.url().includes('/dividends?mode=annual'), { timeout: 20000 }), blocked.page.click('[data-div-mode="annual"]')]);
  await blocked.page.waitForTimeout(300);
  assert(await blocked.page.isVisible('[data-div-mode="annual"].active'), 'mode toggle still works without Chart.js');
  assert(blocked.errors.length === 0, `no page JS errors without Chart.js (got ${JSON.stringify(blocked.errors)})`);

  await browser.close();
  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
