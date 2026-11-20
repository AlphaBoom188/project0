// Shared paths/config for the test suites. Every suite runs against the REAL
// Supabase project in backend/.env (there is no separate test database), so
// each suite only creates users whose line_user_id starts with "test_" (or a
// random "U<hex>" id) and deletes everything it created before exiting.
const path = require('path');

const BACKEND = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true });

// Open a LIFF panel by name (home, tasks, transactions, budgets, networth,
// tax, settings, more). The v5 nav has 5 items, so Budgets/Wealth live under
// Money and Tax/Settings under More: go through switchTab, then wait.
async function openTab(page, name) {
  await page.evaluate((n) => switchTab(n), name);
  await page.waitForSelector(`#tab-${name}:not([hidden])`, { timeout: 15000 });
}

module.exports = {
  openTab,
  BACKEND,
  BASE: process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  FIXTURES: path.join(__dirname, 'fixtures'),
  OUTPUT: path.join(__dirname, '.output'), // screenshots from the LIFF suites (gitignored)
};
