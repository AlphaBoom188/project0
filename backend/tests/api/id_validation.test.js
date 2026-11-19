const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const API = `${BASE}/api`;
const U = 'test_id_validation';
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
let fails = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) fails++; };
const call = async (method, path, body = { amount: 1, is_paid: true, title: 'x', name: 'x' }) => {
  const r = await fetch(`${API}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
(async () => {
  const malformed = [
    ['GET', `transactions/${U}/bad`, 'transaction'], ['PUT', `transactions/${U}/bad`, 'transaction'], ['DELETE', `transactions/${U}/bad`, 'transaction'],
    ['GET', `bills/${U}/bad`, 'bill'], ['DELETE', `bills/${U}/bad`, 'bill'],
    ['PATCH', `bills/${U}/${UNKNOWN}/participants/bad`, 'participant'], ['PATCH', `bills/${U}/bad/participants/bad`, 'bill'],
    ['GET', 'bills/public/bad', 'bill'], ['PATCH', `bills/public/${UNKNOWN}/participants/bad`, 'participant'],
    ['PUT', `accounts/${U}/bad`, 'account'], ['DELETE', `accounts/${U}/bad`, 'account'],
    ['PUT', `recurring/${U}/bad`, 'recurring rule'], ['DELETE', `recurring/${U}/bad`, 'recurring rule'],
    ['PUT', `categories/${U}/bad`, 'category'], ['DELETE', `categories/${U}/bad`, 'category'],
    ['PUT', `portfolio/${U}/bad`, 'holding'], ['DELETE', `portfolio/${U}/bad`, 'holding'], ['POST', `portfolio/${U}/bad/refresh-price`, 'holding'],
    ['PUT', `budget-events/${U}/bad`, 'budget event'], ['DELETE', `budget-events/${U}/bad`, 'budget event'],
  ];
  for (const [m, p, label] of malformed) {
    const r = await call(m, p);
    ok(r.s === 400 && r.b.error === `Invalid ${label} id`, `${m} ${p} -> 400 "Invalid ${label} id" (got ${r.s} ${JSON.stringify(r.b)})`);
  }
  // Non-id path segments that share a position with an id param must be untouched.
  const reassign = await call('POST', `categories/${U}/reassign`, { from_category_id: UNKNOWN, to_category_id: UNKNOWN });
  ok(reassign.s !== 400 || !/Invalid category id/.test(reassign.b.error || ''), `POST categories/:u/reassign not caught by the id check (got ${reassign.s} ${JSON.stringify(reassign.b)})`);
  const refreshAll = await call('POST', `portfolio/${U}/refresh-all`, {});
  ok(refreshAll.s === 200, `POST portfolio/:u/refresh-all unaffected (got ${refreshAll.s})`);
  const scan = await call('POST', `bills/${U}/scan-items`, {});
  ok(scan.s !== 400 || !/Invalid bill id/.test(scan.b.error || ''), `POST bills/:u/scan-items not caught by the id check (got ${scan.s} ${JSON.stringify(scan.b).slice(0, 80)})`);

  // Well-formed but unknown ids on updates -> 404, not 500 "Cannot coerce..."
  const updates = [
    ['transactions', 'Transaction', { amount: 1 }], ['accounts', 'Account', { account_name: 'x' }], ['categories', 'Category', { name: 'x' }],
    ['portfolio', 'Holding', { name: 'x' }], ['recurring', 'Recurring rule', { amount: 1 }], ['budget-events', 'Budget event', { title: 'x' }],
  ];
  for (const [res, label, body] of updates) {
    const r = await call('PUT', `${res}/${U}/${UNKNOWN}`, body);
    ok(r.s === 404 && r.b.error === `${label} not found`, `PUT ${res} unknown id -> 404 "${label} not found" (got ${r.s} ${JSON.stringify(r.b)})`);
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
})();
