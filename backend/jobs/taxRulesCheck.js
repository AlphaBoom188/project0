const cron = require('node-cron');
const { getBangkokYmd } = require('../services/bangkokDay');
const { runOnce } = require('../services/opsAgent');
const { getRules } = require('../services/tax/rules');
const { rulesIssues } = require('../services/tax/rulesCheck');
const { pushText } = require('../services/lineMessagingClient');

// 10 January and 1 March, 09:00 Bangkok: tells the owner on LINE when the
// tax rules need their yearly refresh (docs/TAX_RULES_REFRESH.md). Quiet
// when everything is current. Needs OWNER_LINE_USER_ID.
async function checkTaxRules({ today = getBangkokYmd(), send = true } = {}) {
  const issues = rulesIssues(today, getRules);
  if (!issues.length || !send) return issues;
  const owner = process.env.OWNER_LINE_USER_ID;
  if (!owner) {
    console.warn(`[tax-rules] ${issues.length} issue(s), but OWNER_LINE_USER_ID isn't set`);
    return issues;
  }
  try {
    await pushText(owner, `Tax rules need attention:\n- ${issues.join('\n- ')}\nSee docs/TAX_RULES_REFRESH.md.`);
  } catch (error) {
    console.error(`job: tax rules check could not notify the owner: ${error.message}`);
  }
  return issues;
}

function startTaxRulesCheckJob() {
  cron.schedule('0 9 10 1 *', () => runOnce('taxRulesCheck', getBangkokYmd(), async () => (await checkTaxRules()).length), { timezone: 'Asia/Bangkok' });
  cron.schedule('0 9 1 3 *', () => runOnce('taxRulesCheck', getBangkokYmd(), async () => (await checkTaxRules()).length), { timezone: 'Asia/Bangkok' });
  console.log('[tax-rules] check scheduled for 10 Jan and 1 Mar, 09:00 Asia/Bangkok');
}

module.exports = { startTaxRulesCheckJob, checkTaxRules };
