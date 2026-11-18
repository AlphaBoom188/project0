// Pure goal-tracker math (services/goalMath.js): flat and contribution-only
// projections, the contribution step-up at each anniversary, compounding
// against closed forms, the monthly-rate conversion, Bangkok month stepping
// across year ends and short months, downsampling endpoints, the status
// bands (incl. not_started) and the spec example under this convention.
const {
  GOAL_MAX_POINTS, monthlyRate, addMonths, elapsedMonths, projectGoal, goalStatus, buildGoalProjection,
} = require('../../services/goalMath');
const { getBangkokYmd } = require('../../services/bangkokDay');

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const near = (a, b, eps = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= eps;
const goal = (over = {}) => ({
  start_date: '2026-01-15', start_value: 100000, years: 2, expected_annual_return: 0, monthly_contribution: 0, contribution_growth: 0, target_value: null, ...over,
});

// --- Monthly rate ---
assert(near((1 + monthlyRate(10)) ** 12, 1.1, 1e-12), 'twelve monthly steps compound to exactly the annual return (10%)');
assert(monthlyRate(0) === 0 && near((1 + monthlyRate(-50)) ** 12, 0.5, 1e-12) && near((1 + monthlyRate(100)) ** 12, 2, 1e-12), '0%, -50% and 100% convert exactly');

// --- Month stepping (Bangkok calendar dates) ---
assert(addMonths('2026-11-30', 1) === '2026-12-30' && addMonths('2026-11-30', 2) === '2027-01-30' && addMonths('2026-11-30', 3) === '2027-02-28', 'steps across a year end; Feb clamps to the 28th');
assert(addMonths('2027-12-31', 2) === '2028-02-29' && addMonths('2026-01-31', 2) === '2026-03-31', 'leap-year Feb 29; counted from the start, so Mar 31 stays the 31st');
assert(elapsedMonths('2026-12-15', '2026-12-14') === -1 && elapsedMonths('2026-12-15', '2026-12-15') === 0 && elapsedMonths('2026-12-15', '2027-01-14') === 0
  && elapsedMonths('2026-12-15', '2027-01-15') === 1 && elapsedMonths('2026-12-15', '2028-01-20') === 13, 'elapsed whole months: -1 before start, 0 until the first step, across year ends');
assert(elapsedMonths('2026-01-31', '2026-02-28') === 1 && elapsedMonths('2026-01-31', '2026-02-27') === 0, 'a Jan 31 start completes its first month on Feb 28');
// 23:30 on Dec 31 UTC is already Jan 1 in Bangkok -> the new month has started.
const bkkNewYear = getBangkokYmd(new Date('2026-12-31T17:30:00Z'));
assert(bkkNewYear === '2027-01-01' && elapsedMonths('2026-12-01', bkkNewYear) === 1, `Bangkok "today" decides the month (UTC Dec 31 17:30 -> ${bkkNewYear}, 1 month elapsed)`);

// --- Flat / contributions only ---
const flat = projectGoal(goal());
assert(flat.length === 25 && flat.every((m) => m.value === 100000 && m.contributed === 100000), 'zero return, zero contributions -> flat at start_value (years x 12 + 1 entries)');
assert(flat[0].date === '2026-01-15' && flat[12].date === '2027-01-15' && flat[24].date === '2028-01-15', 'entry k is k months after start_date');
const contrib = projectGoal(goal({ monthly_contribution: 1000 }));
assert(contrib.every((m, k) => near(m.value, 100000 + 1000 * k) && near(m.contributed, m.value)), 'zero return -> value = start + contributions = contributed');
const stepped = projectGoal(goal({ years: 3, monthly_contribution: 1000, contribution_growth: 10 }));
const monthContribution = (k) => stepped[k].contributed - stepped[k - 1].contributed;
assert(near(monthContribution(1), 1000) && near(monthContribution(12), 1000), 'year 1 (months 1-12) uses monthly_contribution');
assert(near(monthContribution(13), 1100) && near(monthContribution(24), 1100) && near(monthContribution(25), 1210) && near(monthContribution(36), 1210), 'steps up by 10% at each anniversary: 1,100 in year 2, 1,210 in year 3');
assert(near(stepped[36].value, 100000 + 12 * (1000 + 1100 + 1210)), 'three-year total with the step-ups');

// --- Compounding against closed forms ---
const compound = projectGoal(goal({ years: 30, expected_annual_return: 7 }));
assert(near(compound[360].value, 100000 * 1.07 ** 30, 1e-4) && near(compound[12].value, 107000, 1e-6), 'no contributions -> start x (1 + r)^years (and exactly +7% after year 1)');
const r = monthlyRate(6);
const annuity = projectGoal(goal({ start_value: 0, years: 5, expected_annual_return: 6, monthly_contribution: 500 }));
assert(near(annuity[60].value, 500 * (((1 + r) ** 60 - 1) / r), 1e-6), 'contributions at the end of each month -> ordinary annuity closed form');
const negative = projectGoal(goal({ years: 1, expected_annual_return: -50 }));
assert(near(negative[12].value, 50000, 1e-6), 'negative return compounds down (-50% -> half)');

// --- Status bands ---
assert(goalStatus(102000, 100000) === 'on_track' && goalStatus(98000, 100000) === 'on_track', '+-2% of expected is on track (inclusive)');
assert(goalStatus(102001, 100000) === 'ahead' && goalStatus(97999, 100000) === 'behind', 'outside the band: ahead / behind');
assert(goalStatus(0, 0) === 'on_track' && goalStatus(1, 0) === 'ahead', 'zero expected: 0 is on track, anything more ahead');
assert(goalStatus(500, 100, false) === 'not_started', 'not started regardless of values');

// --- buildGoalProjection ---
const g = goal({ years: 30, expected_annual_return: 8, monthly_contribution: 2000, contribution_growth: 5 });
const p = buildGoalProjection(g, 150000, '2027-03-20');
const months = projectGoal(g);
assert(p.points.length === GOAL_MAX_POINTS && p.points[0].date === '2026-01' && p.points[p.points.length - 1].date === '2056-01', `361 months downsampled to ${GOAL_MAX_POINTS} points, first and last kept`);
assert(p.points[0].projected_value === 100000 && p.points[p.points.length - 1].projected_value === Math.round(months[360].value * 100) / 100, 'endpoint values kept exactly');
assert(p.points.every((pt, i) => i === 0 || pt.date > p.points[i - 1].date), 'points ascend by YYYY-MM');
assert(p.target_is_projected && p.target_value === p.points[p.points.length - 1].projected_value && p.end_date === '2056-01-15', 'no target_value -> target = projected end value, end_date = start + years');
assert(near(p.expected_now_thb, Math.round(months[14].value * 100) / 100) && near(p.difference_thb, Math.round((150000 - months[14].value) * 100) / 100, 0.011), 'expected now = the projection after 14 whole months (2027-03-15 <= today)');
assert(p.status === goalStatus(150000, months[14].value) && near(p.progress_pct, Math.round((150000 / months[360].value) * 1e4) / 100), 'status and progress % against the projected target');
assert(p.yearly.length === 30 && p.yearly[0].year_index === 1 && p.yearly[0].end_date === '2027-01-15' && p.yearly[29].end_date === '2056-01-15', 'one yearly row per goal year, dated at each anniversary');
assert(near(p.yearly[0].contributed_total, 100000 + 12 * 2000) && near(p.yearly[1].contributed_total, 124000 + 12 * 2100), 'yearly contributed totals include the step-up');
const explicit = buildGoalProjection({ ...g, target_value: 1000000 }, 250000, '2027-03-20');
assert(!explicit.target_is_projected && explicit.target_value === 1000000 && explicit.progress_pct === 25, 'explicit target -> progress = current / target');
const early = buildGoalProjection(goal({ start_date: '2027-01-01' }), 5000, '2026-12-31');
assert(early.status === 'not_started' && early.expected_now_thb === null && early.difference_thb === null && early.progress_pct === 5, 'before start_date -> not_started, no expected/difference, progress still computed');
const late = buildGoalProjection(goal({ years: 1, monthly_contribution: 100 }), 101200, '2040-01-01');
assert(late.expected_now_thb === 101200 && late.status === 'on_track', 'after the end the expected value is capped at the end value');
const zero = buildGoalProjection(goal({ start_value: 0 }), 0, '2026-06-01');
assert(zero.target_value === 0 && zero.progress_pct === null, 'a zero projected target -> progress null, not a division by zero');
const unknown = buildGoalProjection({ ...g, target_value: 1000000 }, null, '2027-03-20');
assert(unknown.status === 'unknown' && unknown.current_value_thb === null && unknown.progress_pct === null && unknown.difference_thb === null,
  'no current value -> status unknown, current/progress/difference null');
assert(unknown.target_value === 1000000 && unknown.points.length === explicit.points.length && near(unknown.expected_now_thb, explicit.expected_now_thb),
  'no current value -> target, points and expected-now still computed');
assert(buildGoalProjection(goal({ start_date: '2027-01-01' }), null, '2026-12-31').status === 'not_started', 'no current value before start_date -> still not_started');

// --- Spec example (Screen 2.4): ฿736,500, 30 years, 10%, ฿1,000/month, +10% YoY ---
// Under this convention (monthly compounding at (1.1)^(1/12) - 1, contribution
// at the end of each month) the end value is ฿18,819,435.72. The brief's
// ฿21,270,360 isn't reproduced by any obvious convention (see the Phase D notes).
const spec = buildGoalProjection(
  { start_date: '2026-10-18', start_value: 736500, years: 30, expected_annual_return: 10, monthly_contribution: 1000, contribution_growth: 10, target_value: null }, 736500, '2026-10-18'
);
assert(spec.target_value === 18819435.72 && spec.yearly[29].contributed_total === 2710428.27, `spec example end value ฿18,819,435.72, contributed ฿2,710,428.27 (got ${spec.target_value}, ${spec.yearly[29].contributed_total})`);
assert(spec.status === 'on_track' && spec.expected_now_thb === 736500, 'on the start date with value = start value -> on track');

process.exit(failures ? 1 : 0);
