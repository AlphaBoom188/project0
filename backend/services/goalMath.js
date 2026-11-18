// Pure math for the investment goal tracker (no network, no DB) -- the
// endpoint (portfolioController.getGoal) reads the user's investment_goals
// row and the portfolio's THB total (loadPortfolio) and hands plain values to
// these functions, so every rule here can be unit-tested with injected data.
//
// Rules (decided with the owner, see the Phase D section in CLAUDE.md):
//   * The projection steps one Bangkok calendar month at a time for
//     years x 12 months from start_date. Month k ends on the same day of the
//     month k months later, clamped to a shorter month's last day (Jan 31 +
//     1 month = Feb 28), always counted from start_date so it never drifts.
//   * Monthly growth = (1 + annual%/100)^(1/12) - 1, so twelve months compound
//     to exactly the annual return. Each month: value x (1 + monthly rate),
//     then that month's contribution is added (end of the month).
//   * The contribution steps up by contribution_growth% at each anniversary
//     of start_date: months 1-12 use monthly_contribution, months 13-24 use
//     it x (1 + g), and so on.
//   * Contributed = start_value + every contribution so far.
//   * Target = target_value when set, else the projected end value.
//     Progress % = current portfolio value (THB) / target x 100, not capped.
//   * On track: the current value against the projection at the latest
//     monthly step on or before today (whole months elapsed since
//     start_date, capped at the end), within a +-2% band of that expected
//     value. Before start_date the status is 'not_started'.
const { downsample } = require('./performanceMath');

const GOAL_MAX_POINTS = 120;
const ON_TRACK_BAND = 0.02;
const round2 = (value) => (value === null ? null : Math.round(value * 100) / 100);
const pad2 = (n) => String(n).padStart(2, '0');

// Compounding `annualPct` (10 = 10%) monthly gives the same yearly growth.
const monthlyRate = (annualPct) => (1 + annualPct / 100) ** (1 / 12) - 1;

// Same day of the month `months` later, clamped to the end of a shorter month.
function addMonths(ymd, months) {
  const [year, month, day] = ymd.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-${pad2(Math.min(day, daysInMonth))}`;
}

// Whole monthly steps from `startYmd` completed by `todayYmd` (0 on the start
// date itself and until the first step's date; -1 before the start).
function elapsedMonths(startYmd, todayYmd) {
  if (todayYmd < startYmd) return -1;
  const [sy, sm] = startYmd.split('-').map(Number);
  const [ty, tm] = todayYmd.split('-').map(Number);
  let k = (ty - sy) * 12 + (tm - sm);
  if (addMonths(startYmd, k) > todayYmd) k -= 1;
  return k;
}

// Month-by-month projection: entry 0 is the start (value = contributed =
// start_value), entry k the end of month k, up to years x 12.
function projectGoal(goal) {
  const rate = monthlyRate(goal.expected_annual_return);
  const growth = goal.contribution_growth / 100;
  const months = goal.years * 12;
  let value = goal.start_value;
  let contributed = goal.start_value;
  const out = [{ index: 0, date: goal.start_date, value, contributed }];
  for (let k = 1; k <= months; k++) {
    const contribution = goal.monthly_contribution * (1 + growth) ** Math.floor((k - 1) / 12);
    value = value * (1 + rate) + contribution;
    contributed += contribution;
    out.push({ index: k, date: addMonths(goal.start_date, k), value, contributed });
  }
  return out;
}

// 'ahead' | 'behind' | 'on_track' (within +-2% of expected) | 'not_started'.
function goalStatus(currentValue, expectedValue, started = true) {
  if (!started) return 'not_started';
  const difference = currentValue - expectedValue;
  if (Math.abs(difference) <= Math.abs(expectedValue) * ON_TRACK_BAND) return 'on_track';
  return difference > 0 ? 'ahead' : 'behind';
}

// Everything the goal endpoint returns besides the goal row itself.
// currentValueThb may be null (the portfolio total couldn't be computed,
// e.g. no USD->THB rate yet): the projection still comes back, with
// current_value_thb / progress_pct / difference_thb null and status 'unknown'.
function buildGoalProjection(goal, currentValueThb, today) {
  const known = currentValueThb !== null && currentValueThb !== undefined;
  const months = projectGoal(goal);
  const end = months[months.length - 1];
  const targetIsProjected = goal.target_value === null || goal.target_value === undefined;
  const target = targetIsProjected ? end.value : goal.target_value;

  const elapsed = elapsedMonths(goal.start_date, today);
  const started = elapsed >= 0;
  const expected = started ? months[Math.min(elapsed, months.length - 1)].value : null;

  return {
    target_value: round2(target),
    target_is_projected: targetIsProjected,
    end_date: end.date,
    current_value_thb: round2(currentValueThb),
    progress_pct: known && target > 0 ? round2((currentValueThb / target) * 100) : null,
    status: !started ? 'not_started' : known ? goalStatus(currentValueThb, expected, started) : 'unknown',
    expected_now_thb: round2(expected),
    difference_thb: known && started ? round2(currentValueThb - expected) : null,
    points: downsample(months, GOAL_MAX_POINTS).map((m) => ({
      date: m.date.slice(0, 7), projected_value: round2(m.value), contributed: round2(m.contributed),
    })),
    yearly: Array.from({ length: goal.years }, (_, i) => {
      const m = months[(i + 1) * 12];
      return { year_index: i + 1, end_date: m.date, contributed_total: round2(m.contributed), projected_value: round2(m.value) };
    }),
  };
}

module.exports = {
  GOAL_MAX_POINTS,
  ON_TRACK_BAND,
  monthlyRate,
  addMonths,
  elapsedMonths,
  projectGoal,
  goalStatus,
  buildGoalProjection,
};
