// Tax rules by Buddhist-era tax year.
const RULES = { 2568: require('./2568'), 2569: require('./2569') };

const YEARS = Object.keys(RULES).map(Number);
function getRules(year) {
  return RULES[Number(year)] || null;
}

module.exports = { getRules, YEARS };
