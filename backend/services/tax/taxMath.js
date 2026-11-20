// Pure Thai personal income tax calculator (no DB, no clock). One person,
// one tax year: profile + income lines + claimed deductions + that year's
// rules (services/tax/rules) -> the full breakdown, ending in "pay" or
// "refund". Mirrors the PND 90/91 form order (RD Ins90 2568, item 11):
//
//   assessable income (after the 65+/disabled exemption)
//   - expenses per income line                    -> income after expenses
//   - allowances (family, insurance, retirement, investment, other, measures)
//   - donations x2 (capped 10%), then donations (capped 10% of what's left)
//   = net income -> progressive tax
//   compared with 0.5% of non-salary assessable income (if > 5,000): pay the higher
//   - tax withheld - dividend tax credit = to pay (+) or refund (-)
//
// Money is handled in satang (integers) internally.

const toS = (baht) => Math.round(Number(baht || 0) * 100); // baht -> satang
const toB = (satang) => Math.round(satang) / 100; // satang -> baht
const clamp0 = (n) => (n > 0 ? n : 0);
const DIVIDEND_CREDIT_RATES = [0.10, 0.15, 0.20, 0.23, 0.25, 0.30];

// ---- Input validation ----

// -> { profile, incomes, claims } normalized, plus warnings.
function normalize(rules, input) {
  const warnings = [];
  const p = input.profile || {};
  const profile = {
    married: p.maritalStatus === 'married',
    spouseHasIncome: p.spouseHasIncome !== false, // assume yes unless told otherwise
    senior: !!p.age65,
    disabled: !!p.disabled,
    children: Array.isArray(p.children) ? p.children.filter((c) => c && Number.isInteger(Number(c.birthYear))).map((c) => ({ birthYear: Number(c.birthYear) })) : [],
  };
  const incomes = [];
  (input.incomes || []).forEach((line, i) => {
    const kind = rules.incomeKinds[line.kind];
    if (!kind) { warnings.push(`Income line ${i + 1}: unknown kind "${line.kind}", ignored`); return; }
    const amount = toS(line.amount);
    if (!(amount > 0)) return;
    const flatOnly = kind.expense.flatOnly || kind.expense.kind === 'pool12' || kind.expense.kind === 'none';
    const method = kind.expense.kind === 'actual' ? 'actual' : (line.expenseMethod === 'actual' && !flatOnly ? 'actual' : 'flat');
    let creditRate = null;
    if (kind.dividendCredit && line.creditRate != null) {
      creditRate = Number(line.creditRate);
      if (!DIVIDEND_CREDIT_RATES.includes(creditRate)) { warnings.push(`Income line ${i + 1}: unsupported dividend credit rate, no credit taken`); creditRate = null; }
    }
    incomes.push({
      index: i,
      kind: line.kind,
      type: kind.type,
      label: line.label || kind.label,
      amount,
      withheld: clamp0(toS(line.withheld)),
      method,
      actualExpenses: clamp0(toS(line.actualExpenses)),
      expenseRule: kind.expense,
      creditRate,
    });
  });
  const claims = { ...(input.claims || {}) };
  const known = new Set(rules.deductions.map((d) => d.key));
  for (const key of Object.keys(claims)) {
    if (!known.has(key)) { warnings.push(`"${key}" isn't a deduction in tax year ${rules.year}, ignored`); delete claims[key]; }
  }
  return { profile, incomes, claims, warnings };
}

// ---- Steps ----

// 65+ / disabled: up to 190,000 exempt from whichever lines the filer picks.
// We pick the lines with the least expense relief first (so the exemption
// replaces income that would otherwise be taxed almost in full).
function applyExemption(rules, profile, incomes) {
  const cap = profile.senior || profile.disabled ? toS(rules.seniorExemption.amount) : 0;
  const relief = (l) => {
    const e = l.expenseRule;
    if (l.method === 'actual') return 0.5; // unknown share; middle of the pack
    return e.kind === 'none' ? 0 : e.kind === 'pool12' || e.kind === 'pool3' ? 0.5 : e.kind === 'performer' ? 0.6 : e.rate || 0;
  };
  let left = cap;
  [...incomes].sort((a, b) => relief(a) - relief(b) || a.index - b.index).forEach((l) => {
    const take = Math.min(left, l.amount);
    l.exempt = take;
    left -= take;
  });
  incomes.forEach((l) => { l.taxable = l.amount - (l.exempt || 0); });
  return cap - left;
}

// Expenses per line; 40(1)+(2) share one 100,000 cap, 40(3) copyright its own.
function applyExpenses(rules, incomes) {
  const POOL12 = 10000000; // 100,000 baht in satang
  const POOL3 = 10000000;
  const pool12 = incomes.filter((l) => l.expenseRule.kind === 'pool12');
  const pool12Total = pool12.reduce((s, l) => s + l.taxable, 0);
  const pool12Expense = Math.min(Math.round(pool12Total * 0.5), POOL12);
  let assigned = 0;
  pool12.forEach((l, i) => { // split the pooled expense pro rata (display only)
    const share = i === pool12.length - 1 ? pool12Expense - assigned : Math.round(pool12Total ? (pool12Expense * l.taxable) / pool12Total : 0);
    l.expense = share;
    assigned += share;
  });
  let pool3Left = POOL3;
  for (const l of incomes) {
    const e = l.expenseRule;
    if (e.kind === 'pool12') continue;
    if (l.method === 'actual') { l.expense = Math.min(l.actualExpenses, l.taxable); continue; }
    switch (e.kind) {
      case 'none': l.expense = 0; break;
      case 'pool3': { const x = Math.min(Math.round(l.taxable * 0.5), pool3Left); pool3Left -= x; l.expense = x; break; }
      case 'rate': l.expense = Math.round(l.taxable * e.rate); break;
      case 'performer': {
        const first = Math.min(l.taxable, 30000000);
        l.expense = Math.min(Math.round(first * 0.6 + (l.taxable - first) * 0.4), 60000000);
        break;
      }
      default: l.expense = 0;
    }
  }
  incomes.forEach((l) => { l.net = l.taxable - l.expense; });
}

function profileAllows(when, profile) {
  if (!when) return true;
  if (when === 'married_spouse_no_income') return profile.married && !profile.spouseHasIncome;
  return false;
}

// Each allowance capped on its own, then the shared caps, in rule order.
function applyAllowances(rules, profile, claims, { assessable, wages }) {
  const rows = [];
  const combinedCaps = { ...rules.combinedCaps, ...(rules.extraCombinedCaps || {}) };
  const used = Object.fromEntries(Object.keys(combinedCaps).map((k) => [k, 0]));
  const lifeGap = () => clamp0(toS(combinedCaps.life_health.cap) - used.life_health);
  for (const d of rules.deductions) {
    if (d.group === 'donation') continue;
    const raw = claims[d.key];
    const row = { key: d.key, group: d.group, label: d.label, claimed: 0, allowed: 0, verified: d.verified !== false };
    if (!profileAllows(d.when, profile)) {
      if (raw) row.note = 'Not available for your profile';
      if (raw || d.input === 'auto') rows.push(row);
      continue;
    }
    let allowed = 0;
    if (d.key === 'personal') {
      if (claims.personal === false) { row.note = 'Not claimed'; rows.push(row); continue; }
      allowed = toS(d.fixed);
    } else if (d.key === 'spouse') {
      allowed = toS(d.fixed);
    } else if (d.key === 'children') {
      // 30,000 each; the 2nd and later child born 2561 or later gets 60,000.
      // childBase each; the 2nd and later child born 2561 or later adds childBonus
      // (annual 30,000 + 30,000; PND 94 15,000 + 30,000 per the Ins94 booklet).
      const base = d.childBase ?? 30000;
      const bonus = d.childBonus ?? 30000;
      profile.children.forEach((c, i) => { allowed += toS(base + (i >= 1 && c.birthYear >= 2561 ? bonus : 0)); });
      row.count = profile.children.length;
    } else if (d.input === 'count') {
      const n = Math.max(0, Math.min(Math.floor(Number(raw) || 0), d.maxUnits || 99));
      row.count = n;
      row.claimed = toS(n * d.perUnit);
      allowed = row.claimed;
    } else if (d.input === 'cost') {
      row.claimed = toS(raw);
      allowed = Math.min(toS(Math.floor(clamp0(Number(raw) || 0) / 1000000) * d.perMillion), toS(d.cap));
    } else {
      row.claimed = clamp0(toS(raw));
      allowed = Math.round(row.claimed * (d.multiplier || 1));
      if (d.rateOf) allowed = Math.min(allowed, Math.round((d.rateOf === 'wages' ? wages : assessable) * d.rate));
      if (d.cap != null && !d.fillsLifeGap) allowed = Math.min(allowed, toS(d.cap));
    }
    if (d.input === 'auto' && d.key !== 'personal') row.claimed = allowed;
    if (d.key === 'personal') row.claimed = allowed;

    if (d.fillsLifeGap) {
      // Pension insurance first fills unused room in the 100,000 life cap
      // (counted as life insurance), then 15% of income up to 200,000.
      const asLife = Math.min(row.claimed, lifeGap());
      used.life_health += asLife;
      const rest = Math.min(row.claimed - asLife, Math.round(assessable * d.rate), toS(d.cap));
      const fitRetirement = Math.min(rest, clamp0(toS(combinedCaps.retirement.cap) - used.retirement));
      used.retirement += fitRetirement;
      row.allowed = asLife + fitRetirement;
      if (asLife) row.note = `${toB(asLife).toLocaleString('en-US')} counted under the life insurance cap`;
      if (fitRetirement < rest) row.trimmedBy = 'retirement';
      rows.push(row);
      continue;
    }
    for (const group of d.combined || []) {
      const room = clamp0(toS(combinedCaps[group].cap) - used[group]);
      if (allowed > room) { allowed = room; row.trimmedBy = group; }
    }
    for (const group of d.combined || []) used[group] += allowed;
    row.allowed = allowed;
    if (row.claimed || row.allowed || d.input === 'auto') rows.push(row);
  }
  return rows;
}

function applyDonations(rules, claims, base) {
  const dbl = rules.deductions.find((d) => d.key === 'donation_double');
  const gen = rules.deductions.find((d) => d.key === 'donation');
  const rows = [];
  const paidDouble = clamp0(toS(claims.donation_double));
  const doubleAllowed = Math.min(Math.round(paidDouble * dbl.multiplier), Math.round(base * dbl.capPct));
  if (paidDouble) rows.push({ key: 'donation_double', group: 'donation', label: dbl.label, claimed: paidDouble, allowed: doubleAllowed, verified: true });
  const remaining = base - doubleAllowed;
  const paidGen = clamp0(toS(claims.donation));
  const genAllowed = Math.min(paidGen, Math.round(remaining * gen.capPct));
  if (paidGen) rows.push({ key: 'donation', group: 'donation', label: gen.label, claimed: paidGen, allowed: genAllowed, verified: true });
  return rows;
}

// Progressive tax with the per-bracket breakdown.
function progressiveTax(brackets, net) {
  let lower = 0;
  let tax = 0;
  const rows = [];
  for (const b of brackets) {
    const upper = b.upTo === Infinity ? Infinity : toS(b.upTo);
    const inBand = clamp0(Math.min(net, upper) - lower);
    const t = Math.round(inBand * b.rate);
    rows.push({ from: toB(lower), to: b.upTo === Infinity ? null : b.upTo, rate: b.rate, taxable: toB(inBand), tax: toB(t) });
    tax += t;
    if (net <= upper) break;
    lower = upper;
  }
  const marginal = rows.length ? rows[rows.length - 1].rate : 0;
  return { tax, rows, marginal };
}

// Filing: PND 91 for salary only, else PND 90. Required above 120k/220k
// (PND 91) or 60k/120k (PND 90), single/married (gross income).
function filing(rules, profile, incomes) {
  const onlySalary = incomes.every((l) => l.type === '40(1)');
  const gross = incomes.reduce((s, l) => s + l.amount, 0);
  const threshold = toS(onlySalary ? (profile.married ? 220000 : 120000) : (profile.married ? 120000 : 60000));
  return {
    form: incomes.length === 0 || onlySalary ? 'PND91' : 'PND90',
    mustFile: gross > threshold,
    threshold: toB(threshold),
    paperDeadline: rules.filing.paperDeadline,
    onlineDeadline: rules.filing.onlineDeadline,
  };
}

// ---- Main ----

function computeTax(rules, input = {}) {
  if (!rules) throw new Error('Unknown tax year');
  const { profile, incomes, claims, warnings } = normalize(rules, input);

  const exempt = applyExemption(rules, profile, incomes);
  applyExpenses(rules, incomes);

  // Dividend credit (Thai dividends included in the return): credit =
  // dividend x r / (1 - r), added to assessable income and to tax credits.
  let dividendCredit = 0;
  incomes.forEach((l) => {
    l.credit = l.creditRate ? Math.round((l.taxable * l.creditRate) / (1 - l.creditRate)) : 0;
    l.net += l.credit;
    dividendCredit += l.credit;
  });

  const gross = incomes.reduce((s, l) => s + l.amount, 0);
  const assessable = incomes.reduce((s, l) => s + l.taxable + l.credit, 0); // after exemption, with credits
  const wages = incomes.filter((l) => l.type === '40(1)').reduce((s, l) => s + l.taxable, 0);
  const expenses = incomes.reduce((s, l) => s + l.expense, 0);
  const afterExpenses = incomes.reduce((s, l) => s + l.net, 0);

  const allowanceRows = applyAllowances(rules, profile, claims, { assessable, wages });
  const allowances = allowanceRows.reduce((s, r) => s + r.allowed, 0);
  const afterAllowances = clamp0(afterExpenses - allowances);
  const donationRows = applyDonations(rules, claims, afterAllowances);
  const donations = donationRows.reduce((s, r) => s + r.allowed, 0);
  const net = clamp0(afterAllowances - donations);

  const prog = progressiveTax(rules.brackets, net);
  const nonSalary = incomes.filter((l) => l.type !== '40(1)').reduce((s, l) => s + l.taxable + l.credit, 0);
  const minRaw = Math.round(nonSalary * rules.minimumTax.rate);
  const minApplies = minRaw > toS(rules.minimumTax.ignoreAtOrBelow) && minRaw > prog.tax;
  const taxDue = minApplies ? minRaw : prog.tax;

  const withheld = incomes.reduce((s, l) => s + l.withheld, 0);
  const prepaid = clamp0(toS(input.prepaid)); // tax already paid with the half-year PND 94
  const balance = taxDue - withheld - dividendCredit - prepaid; // + pay, - refund

  // The most each deduction can give on its own (before shared caps), for
  // the checklist's "X of Y"; null = no limit of its own.
  const limits = {};
  for (const d of rules.deductions) {
    let lim = null;
    if (!profileAllows(d.when, profile)) lim = 0;
    else if (d.fixed != null) lim = toS(d.fixed);
    else if (d.key === 'children') lim = (allowanceRows.find((r) => r.key === 'children') || {}).allowed || 0;
    else if (d.input === 'count') lim = toS(d.perUnit * (d.maxUnits || 0));
    else if (d.group === 'donation') lim = Math.round((d.key === 'donation' ? afterAllowances - ((donationRows[0] && donationRows[0].key === 'donation_double') ? donationRows[0].allowed : 0) : afterAllowances) * d.capPct / (d.multiplier || 1));
    else {
      const byRate = d.rateOf ? Math.round((d.rateOf === 'wages' ? wages : assessable) * d.rate) : Infinity;
      const byCap = d.cap != null ? toS(d.cap) : Infinity;
      lim = Math.min(byRate, byCap);
      if (lim === Infinity) lim = null;
    }
    limits[d.key] = lim == null ? null : toB(lim);
  }
  const combinedAll = { ...rules.combinedCaps, ...(rules.extraCombinedCaps || {}) };
  const sharedCaps = Object.entries(combinedAll).map(([key, c]) => {
    const members = rules.deductions.filter((d) => (d.combined || []).includes(key) || (key === 'retirement' && d.fillsLifeGap)).map((d) => d.key);
    return { key, label: c.label, cap: c.cap, members };
  });

  const unverified = [...allowanceRows, ...donationRows].filter((r) => !r.verified && r.allowed > 0).map((r) => r.label);
  if (unverified.length) warnings.push(`Not yet checked against a Revenue Department source: ${unverified.join('; ')}`);
  if (rules.carriedOver) warnings.push(`Tax year ${rules.year} uses the ${rules.year - 1} rules until the Revenue Department publishes ${rules.year}'s.`);

  return {
    year: rules.year,
    incomes: incomes.map((l) => ({
      index: l.index, kind: l.kind, type: l.type, label: l.label, amount: toB(l.amount), exempt: toB(l.exempt || 0),
      expenseMethod: l.method, expense: toB(l.expense), dividendCredit: toB(l.credit), net: toB(l.net), withheld: toB(l.withheld),
    })),
    totals: {
      gross: toB(gross),
      exempt: toB(exempt),
      assessable: toB(assessable),
      expenses: toB(expenses),
      afterExpenses: toB(afterExpenses),
      allowances: toB(allowances),
      afterAllowances: toB(afterAllowances),
      donations: toB(donations),
      netIncome: toB(net),
    },
    allowances: allowanceRows.map((r) => ({ ...r, claimed: toB(r.claimed), allowed: toB(r.allowed) })),
    limits,
    sharedCaps,
    donations: donationRows.map((r) => ({ ...r, claimed: toB(r.claimed), allowed: toB(r.allowed) })),
    brackets: prog.rows,
    progressiveTax: toB(prog.tax),
    minimumTax: { base: toB(nonSalary), tax: toB(minRaw), applies: minApplies },
    taxDue: toB(taxDue),
    withheld: toB(withheld),
    dividendCredit: toB(dividendCredit),
    prepaid: toB(prepaid),
    balance: toB(balance),
    result: balance > 0 ? 'pay' : balance < 0 ? 'refund' : 'none',
    effectiveRate: gross ? Math.round((taxDue / gross) * 10000) / 10000 : 0,
    marginalRate: minApplies ? null : prog.marginal,
    instalments: balance >= toS(3000), // may pay in 3 equal parts when filed on time
    filing: filing(rules, profile, incomes),
    warnings,
  };
}

module.exports = { computeTax, progressiveTax, DIVIDEND_CREDIT_RATES, _internal: { toS, toB } };
