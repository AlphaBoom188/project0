// Net Worth goal card in the LIFF app: the empty state, setting a goal up
// through the sheet (defaults: today in Bangkok, the portfolio value), the
// card's target / progress / status / Chart.js projection / year-by-year
// table, editing to an explicit target and to a behind-plan goal, a server
// validation error shown inline, deleting through the confirm modal, the
// theme redraw, and with the Chart.js CDN blocked everything but the chart
// still renders ("Chart unavailable").
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_goal_card';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const baht = (v) => `${v < 0 ? '-' : ''}฿${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

async function cleanup() {
  for (const t of ['investment_goals', 'asset_lots', 'asset_holdings', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

async function openApp(browser, { blockChart = false, failPortfolio = false } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Goal Card Test', pictureUrl: '' }) };` }));
  if (blockChart) await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  // Only GET /api/portfolio/:u itself (not /goal, /performance, ...): simulates a USD->THB 502.
  if (failPortfolio) await page.route((url) => url.pathname === `/api/portfolio/${U}`, (route) =>
    route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'USD->THB rate unavailable' }) }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await page.click('.nav-tab[data-tab="networth"]');
  await page.waitForSelector('#goal-card:not([hidden])', { timeout: 20000 });
  return { page, errors };
}

// Chart.js loads on first use (app.js loadChartJs), so wait for the chart.
const chartState = async (page) => {
  await page.waitForFunction(() => window.Chart && window.Chart.getChart(document.getElementById('goal-chart')), null, { timeout: 15000 }).catch(() => {});
  return chartNow(page);
};
const chartNow = (page) => page.evaluate(() => {
  const chart = window.Chart && window.Chart.getChart(document.getElementById('goal-chart'));
  return chart ? {
    id: chart.id, type: chart.config.type, labels: chart.data.labels,
    datasets: chart.data.datasets.map((d) => ({ label: d.label, color: d.borderColor, dash: d.borderDash || null, data: d.data, showLine: d.showLine })),
  } : null;
});
const token = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const height = (page, sel) => page.$eval(sel, (e) => e.getBoundingClientRect().height);

async function fillGoal(page, values) {
  for (const [field, value] of Object.entries(values)) await page.fill(`#goal-field-${field}`, String(value));
}
async function saveGoal(page) {
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/goal') && r.request().method() === 'PUT', { timeout: 20000 }), page.click('#goal-submit')]);
  return res;
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Goal Card Test' }) });
  // Manual-price gold: the portfolio is worth exactly ฿42,000, no price fetch.
  await api(`/portfolio/${U}`, { method: 'POST', body: JSON.stringify({ asset_type: 'gold', symbol: 'GOLD-BAHT', quantity: 2, average_cost: 20000, current_price: 21000, trade_date: '2025-01-02' }) });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const { page, errors } = await openApp(browser);

  // --- Empty state ---
  await page.waitForSelector('#goal-empty:not([hidden])', { timeout: 15000 });
  assert((await page.textContent('#goal-empty')).includes('Set a target and see if your portfolio is on track') && (await page.isHidden('#goal-body')), 'no goal -> the empty line and Set up goal');
  assert((await height(page, '#goal-setup-button')) >= 44, 'Set up goal button >= 44px tall');

  // --- Set up through the sheet ---
  await page.click('#goal-setup-button');
  await page.waitForSelector('#goal-modal:not([hidden])');
  assert((await page.inputValue('#goal-field-start-date')) === today && (await page.inputValue('#goal-field-start-value')) === '42000', 'defaults: start date = today (Bangkok), start value = portfolio value in whole baht');
  assert(await page.isHidden('#goal-delete'), 'no Delete goal when setting up');
  const inputs = await page.$$eval('#goal-form input', (els) => els.map((e) => ({ id: e.id, size: getComputedStyle(e).fontSize, mode: e.inputMode })));
  assert(inputs.length === 7 && inputs.every((i) => i.size === '16px'), `all 7 inputs are 16px (got ${JSON.stringify(inputs.map((i) => i.size))})`);
  assert(inputs.filter((i) => /start-value|return|contribution|growth|target/.test(i.id)).every((i) => i.mode === 'decimal'), 'money/percent fields use inputmode="decimal"');
  assert((await height(page, '#goal-submit')) >= 44 && (await page.$eval('#goal-submit', (b) => b.getBoundingClientRect().width)) > 300, 'Save is a full-width primary button');
  await fillGoal(page, { years: 10, return: 8, contribution: 1000, growth: 5 });
  const created = await saveGoal(page);
  assert(created.status() === 200, `Save -> PUT 200 (got ${created.status()})`);
  await page.waitForSelector('#goal-body:not([hidden])');
  assert(await page.isHidden('#goal-modal'), 'the sheet closes after saving');

  // --- Card ---
  let expected = (await api(`/portfolio/${U}/goal`)).body.projection;
  assert((await page.textContent('#goal-target')) === baht(expected.target_value) && (await page.textContent('#goal-target-label')) === 'Goal target (projected)',
    `target ฿ + "projected" (got "${await page.textContent('#goal-target-label')}" ${await page.textContent('#goal-target')})`);
  assert((await page.textContent('#goal-progress-pct')) === `${expected.progress_pct.toFixed(1)}%`, `progress % (got ${await page.textContent('#goal-progress-pct')})`);
  const fillWidth = await page.$eval('#goal-progress-fill', (f) => f.style.width);
  assert(fillWidth === `${expected.progress_pct}%` && (await page.$eval('#goal-progress-fill', (f) => f.className)) === 'category-budget-fill', `progress bar uses the budget bar styles at ${fillWidth}`);
  assert((await page.textContent('#goal-status')) === 'On track', `starting today at the current value -> "On track" (got "${await page.textContent('#goal-status')}")`);
  await page.waitForFunction(() => window.Chart && window.Chart.getChart(document.getElementById('goal-chart')), null, { timeout: 15000 });
  let chart = await chartState(page);
  const accent = await token(page, '--brand');
  const secondary = await token(page, '--muted-foreground');
  assert(chart.type === 'line' && chart.datasets.map((d) => d.label).join() === 'Projected,Contributed,Today', `line chart: Projected, Contributed, Today (got ${chart.datasets.map((d) => d.label)})`);
  assert(chart.datasets[0].color === accent && chart.datasets[1].color === secondary && chart.datasets[1].dash && chart.datasets[1].dash.length === 2, 'projected = --brand (Clay), contributed dashed --muted-foreground');
  const todayPoints = chart.datasets.find((d) => d.label === 'Today').data.map((v, i) => [v, i]).filter(([v]) => v !== null);
  assert(todayPoints.length === 1 && todayPoints[0][0] === 42000 && todayPoints[0][1] === 0 && chart.datasets.find((d) => d.label === 'Today').showLine === false, `today's value is one highlighted point (got ${JSON.stringify(todayPoints)})`);
  assert(chart.labels.length === expected.points.length && chart.labels[0] === today.slice(0, 7), 'labels are the Bangkok months of the points');
  const tooltip = await page.evaluate(() => {
    const cb = window.Chart.getChart(document.getElementById('goal-chart')).options.plugins.tooltip.callbacks;
    return { label: cb.label({ dataset: { label: 'Projected' }, raw: 1234.5 }), title: cb.title([{ dataIndex: 0 }]) };
  });
  const monthLabel = new Date(`${today.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  assert(tooltip.label === 'Projected: ฿1,234.50' && tooltip.title === monthLabel, `tooltip: ฿ to 2 decimals + month (got ${JSON.stringify(tooltip)})`);

  // --- Year-by-year table ---
  assert(await page.isHidden('#goal-table-wrap'), 'year-by-year table starts collapsed');
  assert((await height(page, '#goal-table-toggle')) >= 44 && (await height(page, '#goal-edit-button')) >= 44, 'table toggle and Edit goal >= 44px tall');
  await page.click('#goal-table-toggle');
  const rows = await page.$$eval('#goal-table-body tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)));
  assert((await page.getAttribute('#goal-table-toggle', 'aria-expanded')) === 'true' && rows.length === 10, `toggle opens 10 yearly rows (got ${rows.length})`);
  assert(rows[0][0].startsWith('1 ') && rows[0][1] === baht(expected.yearly[0].contributed_total) && rows[9][2] === baht(expected.yearly[9].projected_value),
    `rows: Year, Contributed, Projected value (got ${JSON.stringify(rows[0])})`);

  // --- Edit: explicit target ---
  await page.click('#goal-edit-button');
  await page.waitForSelector('#goal-modal:not([hidden])');
  assert((await page.inputValue('#goal-field-years')) === '10' && (await page.inputValue('#goal-field-return')) === '8' && (await page.isVisible('#goal-delete')), 'edit prefills the goal and shows Delete goal');
  await fillGoal(page, { target: 168000 });
  await saveGoal(page);
  await page.waitForFunction(() => document.getElementById('goal-target').textContent === '฿168,000.00', null, { timeout: 10000 }).catch(() => {});
  assert((await page.textContent('#goal-target-label')) === 'Goal target' && (await page.textContent('#goal-progress-pct')) === '25.0%', 'explicit target ฿168,000 -> "Goal target", 25.0%');

  // --- Inline validation error ---
  await page.click('#goal-edit-button');
  await fillGoal(page, { years: 61 });
  const rejected = await saveGoal(page);
  await page.waitForSelector('#goal-modal-error:not([hidden])');
  assert(rejected.status() === 400 && (await page.textContent('#goal-modal-error')).includes('years must be a whole number from 1 to 60') && (await page.isVisible('#goal-modal')),
    `bad value -> server message inline, sheet stays open (got "${await page.textContent('#goal-modal-error')}")`);
  assert((await db.from('investment_goals').select('years').eq('line_user_id', U).single()).data.years === 10, 'nothing written by the rejected save');

  // --- Behind plan ---
  await fillGoal(page, { years: 10, 'start-date': '2025-01-01', 'start-value': 100000 });
  await saveGoal(page);
  await page.waitForFunction(() => document.getElementById('goal-status').textContent.startsWith('Behind'), null, { timeout: 10000 }).catch(() => {});
  expected = (await api(`/portfolio/${U}/goal`)).body.projection;
  assert(expected.status === 'behind' && (await page.textContent('#goal-status')) === `Behind plan by ${baht(-expected.difference_thb)}`, `"Behind plan by ฿X" (got "${await page.textContent('#goal-status')}")`);
  assert((await page.$eval('#goal-progress-fill', (f) => f.classList.contains('over'))), 'far behind plan -> red bar (.over)');
  chart = await chartState(page);
  const pt = chart.datasets.find((d) => d.label === 'Today').data.findIndex((v) => v !== null);
  assert(pt > 0 && chart.labels[pt] <= today.slice(0, 7) && (pt === chart.labels.length - 1 || chart.labels[pt + 1] > today.slice(0, 7)), `today's point sits on the latest month at or before today (${chart.labels[pt]})`);
  await page.$eval('#goal-card', (c) => c.scrollIntoView());
  await page.screenshot({ path: `${OUTPUT}/goal_light.png` });

  // --- Theme change redraws ---
  await page.evaluate(() => setTheme('dark'));
  const dark = await chartState(page);
  const legendDark = await page.evaluate(() => window.Chart.getChart(document.getElementById('goal-chart')).options.plugins.legend.labels.color);
  assert(dark.id !== chart.id && legendDark === (await token(page, '--muted-foreground')) && legendDark !== secondary, `theme change re-creates the chart with dark tokens (legend ${legendDark})`);
  await page.$eval('#goal-card', (c) => c.scrollIntoView());
  await page.screenshot({ path: `${OUTPUT}/goal_dark.png` });
  await page.evaluate(() => setTheme('system'));

  // --- Delete via the confirm modal ---
  await page.click('#goal-edit-button');
  await page.click('#goal-delete');
  await page.waitForSelector('#confirm-modal:not([hidden])');
  assert((await page.textContent('#confirm-message')).includes('Delete this goal'), 'Delete goal asks through the confirm modal');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/goal') && r.request().method() === 'DELETE', { timeout: 20000 }), page.click('#confirm-ok')]);
  await page.waitForSelector('#goal-empty:not([hidden])');
  assert((await page.isHidden('#goal-body')) && (await page.isHidden('#goal-modal')), 'after delete -> the empty state again');
  assert((await db.from('investment_goals').select('*').eq('line_user_id', U)).data.length === 0, 'goal row deleted');

  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await page.context().close();

  // --- Chart.js blocked: everything but the chart ---
  await api(`/portfolio/${U}/goal`, { method: 'PUT', body: JSON.stringify({ start_date: today, start_value: 42000, years: 5, expected_annual_return: 6, target_value: 84000 }) });
  const blocked = await openApp(browser, { blockChart: true });
  await blocked.page.waitForSelector('#goal-body:not([hidden])', { timeout: 15000 });
  assert((await blocked.page.textContent('#goal-note')).includes('Chart unavailable') && (await blocked.page.isHidden('#goal-chart-wrap')), 'CDN blocked -> "Chart unavailable", no canvas');
  assert((await blocked.page.textContent('#goal-target')) === '฿84,000.00' && (await blocked.page.textContent('#goal-progress-pct')) === '50.0%' && (await blocked.page.textContent('#goal-status')) === 'On track',
    'target, progress and status still render without Chart.js');
  await blocked.page.click('#goal-table-toggle');
  assert((await blocked.page.$$('#goal-table-body tr')).length === 5, 'year-by-year table still works without Chart.js');
  assert(blocked.errors.length === 0, `no page JS errors without Chart.js (got ${JSON.stringify(blocked.errors)})`);

  await blocked.page.context().close();

  // --- Explicit target: drawn as a flat line ---
  const withTarget = await openApp(browser);
  await withTarget.page.waitForSelector('#goal-body:not([hidden])', { timeout: 15000 });
  const tChart = await chartState(withTarget.page);
  const target = tChart.datasets.find((d) => d.label === 'Target');
  assert(target && target.data.length === tChart.labels.length && target.data.every((v) => v === 84000) && target.dash && target.color === (await token(withTarget.page, '--foreground')),
    `explicit target -> a dashed --foreground "Target" line at ฿84,000 (got ${JSON.stringify(tChart.datasets.map((d) => d.label))})`);
  assert(withTarget.errors.length === 0, `no page JS errors with a target line (got ${JSON.stringify(withTarget.errors)})`);
  await withTarget.page.context().close();

  // --- Portfolio fetch fails: the goal card still loads ---
  const failed = await openApp(browser, { failPortfolio: true });
  await failed.page.waitForSelector('#goal-body:not([hidden])', { timeout: 15000 }).catch(() => {});
  assert(!(await failed.page.isHidden('#goal-body')) && (await failed.page.textContent('#goal-target')) === '฿84,000.00',
    'GET /portfolio/:u 502 -> the goal card still renders its target');
  assert(failed.errors.length === 0, `no page JS errors when the portfolio fetch fails (got ${JSON.stringify(failed.errors)})`);
  await failed.page.context().close();

  await browser.close();
  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
