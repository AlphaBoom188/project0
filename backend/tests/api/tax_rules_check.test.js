// Pure: services/tax/rulesCheck.js (the yearly refresh guard) against the
// real registry and a fake one.
const { BACKEND } = require('../lib');
const { rulesIssues } = require(`${BACKEND}/services/tax/rulesCheck.js`);
const { getRules } = require(`${BACKEND}/services/tax/rules/index.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };

// Today (Nov 2026 = 2569): rules for 2569 exist (carried over is fine mid-year).
assert(rulesIssues('2026-11-20', getRules).length === 0, 'November 2569: nothing to do');
// January 2027 = 2570 with today's registry: everything is due.
let issues = rulesIssues('2027-01-10', getRules);
assert(issues.some((i) => i.startsWith('No rules for tax year 2570')), 'no rules for the new current year');
assert(issues.some((i) => i.includes('2569 still uses the 2568 rules')), 'filing year still carried over');
assert(issues.some((i) => i.includes('online filing deadline for 2569')), 'online deadline not set');
assert(issues.some((i) => /rules? (is|are) still unverified/.test(i)), 'unverified rules listed');
// A fully refreshed (fake) registry: quiet.
const fake = {
  2569: { year: 2569, filing: { onlineDeadline: '2570-04-08' }, deductions: [{ key: 'x', verified: true }] },
  2570: { year: 2570, carriedOver: true, filing: {}, deductions: [] },
};
assert(rulesIssues('2027-01-10', (y) => fake[y] || null).length === 0, 'refreshed registry: no issues');
assert(rulesIssues('2027-06-01', (y) => ({ 2570: fake[2570] }[y] || null)).length === 0, 'after April only the current year matters');
assert(rulesIssues('2027-03-01', () => null).length === 2, 'nothing at all: two issues (current and filing year)');

process.exit(failures ? 1 : 0);
