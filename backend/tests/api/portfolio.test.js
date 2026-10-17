const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const lineUserId = 'test_portfolio_001';
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: lineUserId, display_name: 'Portfolio Test' }) });

  // --- Create holdings across types, including manual-only (gold) with an explicit current_price ---
  const stock = await api(`/portfolio/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ asset_type: 'stock', symbol: 'AAPL', name: 'Apple Inc', quantity: 10, average_cost: 150 }),
  });
  assert(stock.status === 201, `create stock holding (got ${stock.status}: ${JSON.stringify(stock.body)})`);
  assert(stock.body.holding.cost_basis === 1500 && stock.body.holding.market_value === 1500, `no price yet -> market_value falls back to cost_basis (got ${stock.body.holding.market_value})`);
  const stockId = stock.body.holding.id;

  const gold = await api(`/portfolio/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ asset_type: 'gold', symbol: 'GOLD-1OZ', name: '1oz Gold Bar', quantity: 2, average_cost: 1800, current_price: 2000 }),
  });
  assert(gold.status === 201, `create gold holding with manual current_price (got ${gold.status}: ${JSON.stringify(gold.body)})`);
  assert(gold.body.holding.market_value === 4000 && gold.body.holding.gain === 400, `gold holding computes market_value/gain from manual price (got value=${gold.body.holding.market_value}, gain=${gold.body.holding.gain})`);
  const goldId = gold.body.holding.id;

  // --- Validation ---
  const badType = await api(`/portfolio/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ asset_type: 'bogus', symbol: 'X', quantity: 1, average_cost: 1 }),
  });
  assert(badType.status === 400, `invalid asset_type rejected (got ${badType.status})`);

  const badQty = await api(`/portfolio/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ asset_type: 'stock', symbol: 'X', quantity: -1, average_cost: 1 }),
  });
  assert(badQty.status === 400, `negative quantity rejected (got ${badQty.status})`);

  // --- Get portfolio: totals + allocation ---
  const list1 = await api(`/portfolio/${lineUserId}`);
  assert(list1.status === 200 && list1.body.holdings.length === 2, `list returns both holdings (got ${list1.body.holdings?.length})`);
  // Totals are in THB (migration 015): AAPL defaults to USD, so it's converted at fx_usd_thb; gold is THB.
  const fx = list1.body.fx_usd_thb;
  const expectedTotal = 1500 * fx + 4000;
  assert(Math.abs(list1.body.totals.total_value - expectedTotal) < 0.01, `totals.total_value sums both holdings in THB (got ${list1.body.totals.total_value}, fx ${fx})`);
  assert(
    Math.abs(list1.body.allocation_by_type.gold - (4000 / expectedTotal) * 100) < 0.01,
    `allocation_by_type.gold is correct percentage (got ${list1.body.allocation_by_type.gold})`
  );

  // --- quantity/average_cost come from lots now: PUT rejects them, adding a lot recomputes cost_basis ---
  const updateRes = await api(`/portfolio/${lineUserId}/${stockId}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity: 20, average_cost: 140 }),
  });
  assert(updateRes.status === 400, `PUT with quantity/average_cost is rejected -- edit lots instead (got ${updateRes.status})`);
  const lotRes = await api(`/portfolio/${lineUserId}/${stockId}/lots`, {
    method: 'POST',
    body: JSON.stringify({ side: 'buy', quantity: 10, price: 130 }),
  });
  assert(lotRes.status === 201 && lotRes.body.holding.cost_basis === 2800, `adding a lot recomputes cost_basis (got ${lotRes.body.holding?.cost_basis})`);

  // --- Manual-price type rejected by refresh-price (no live source) ---
  const refreshGold = await api(`/portfolio/${lineUserId}/${goldId}/refresh-price`, { method: 'POST' });
  assert(refreshGold.status === 400, `refresh-price on a manual-only type (gold) is rejected (got ${refreshGold.status})`);

  // --- Live refresh-price on a real, well-known stock ticker (hits the actual Yahoo Finance endpoint) ---
  const refreshStock = await api(`/portfolio/${lineUserId}/${stockId}/refresh-price`, { method: 'POST' });
  console.log(`(informational) refresh-price AAPL -> status ${refreshStock.status}, body: ${JSON.stringify(refreshStock.body)}`);

  // --- refresh-all: should attempt the stock, skip gold entirely ---
  const refreshAll = await api(`/portfolio/${lineUserId}/refresh-all`, { method: 'POST' });
  assert(refreshAll.status === 200, `refresh-all succeeds (got ${refreshAll.status})`);
  assert(refreshAll.body.results.length === 1, `refresh-all only attempts the one live-priced holding, skips gold (got ${refreshAll.body.results.length} results)`);

  // --- Emergency fund: unset initially ---
  const efUnset = await api(`/portfolio/${lineUserId}`);
  assert(efUnset.body.emergency_fund.goal_amount === null, `emergency_fund unset initially (got ${JSON.stringify(efUnset.body.emergency_fund)})`);

  // --- Set up an account + emergency fund goal ---
  const accountRes = await api(`/accounts/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ account_name: 'Emergency Savings', account_type: 'bank', balance: 15000 }),
  });
  const accountId = accountRes.body.account.id;

  const efSet = await api(`/users/${lineUserId}/emergency-fund`, {
    method: 'PUT',
    body: JSON.stringify({ goal_amount: 60000, account_id: accountId }),
  });
  assert(efSet.status === 200, `set emergency fund goal + account (got ${efSet.status}: ${JSON.stringify(efSet.body)})`);

  const efRejectBadAccount = await api(`/users/${lineUserId}/emergency-fund`, {
    method: 'PUT',
    body: JSON.stringify({ account_id: '00000000-0000-0000-0000-000000000000' }),
  });
  assert(efRejectBadAccount.status === 400, `emergency-fund rejects an account that doesn't belong to the user (got ${efRejectBadAccount.status})`);

  const efStatus = await api(`/portfolio/${lineUserId}`);
  assert(
    efStatus.body.emergency_fund.current_amount === 15000 && efStatus.body.emergency_fund.percent_funded === 25,
    `emergency_fund reads live account balance + computes percent_funded (got ${JSON.stringify(efStatus.body.emergency_fund)})`
  );

  // --- Clearing the goal ---
  await api(`/users/${lineUserId}/emergency-fund`, { method: 'PUT', body: JSON.stringify({ goal_amount: null }) });
  const efCleared = await api(`/portfolio/${lineUserId}`);
  assert(efCleared.body.emergency_fund.goal_amount === null, `emergency fund goal can be cleared (got ${JSON.stringify(efCleared.body.emergency_fund)})`);

  // --- Delete a holding ---
  const deleteRes = await api(`/portfolio/${lineUserId}/${goldId}`, { method: 'DELETE' });
  assert(deleteRes.status === 200, `delete holding succeeds (got ${deleteRes.status})`);
  const afterDelete = await api(`/portfolio/${lineUserId}`);
  assert(afterDelete.body.holdings.length === 1, `holding is actually gone after delete (got ${afterDelete.body.holdings.length} remaining)`);

  // cleanup
  await serviceClient.from('asset_holdings').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('accounts').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('users').delete().eq('line_user_id', lineUserId);
  console.log('\nCleaned up.');
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
