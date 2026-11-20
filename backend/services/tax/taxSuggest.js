// Tax Phase 3: suggestions from what the app already knows (pure; the
// controller loads the rows). Nothing is applied silently: each suggestion
// is shown with its reason and the tax it changes, and the user adds or
// dismisses it.
//
// Sources, for one tax year (Buddhist era) = one calendar year, Bangkok dates:
//   * income transactions: salary deposits (projected to 12 months for the
//     current year), deposit interest, dividends (when the portfolio has
//     none), rent, and everything else as "other income" (low confidence)
//   * expense transactions: life / health / pension insurance, social
//     security, donations, home loan interest, political party
//   * portfolio lots: RMF and ThaiESG purchases in the year (deductions);
//     RMF/ThaiESG units sold within 5 years of purchase (income, breach)
//   * portfolio dividends received in the year (Thai: with 10% withheld)
// Transfers never count.

const crypto = require('crypto');

const round2 = (n) => Math.round(n * 100) / 100;
const lower = (s) => String(s || '').toLowerCase();
const text = (t) => `${lower(t.description)} ${lower(t.category_name)}`;

// Income keywords (order matters: the first match wins).
const INCOME_RULES = [
  { key: 'salary', re: /เงินเดือน|salary|payroll|โบนัส|bonus|ค่าจ้าง|\bwages?\b/ },
  { key: 'interest', re: /ดอกเบี้ย|interest/ },
  { key: 'dividend', re: /ปันผล|dividend/ },
  { key: 'rent', re: /ค่าเช่า|rental income|\brent\b/ },
];
// Expense keywords -> deduction keys (first match wins).
const EXPENSE_RULES = [
  { key: 'parents_health_insurance', re: /ประกันสุขภาพ\s*(พ่อ|แม่|บิดา|มารดา)|parents?'?s? health insurance/ },
  { key: 'pension_insurance', re: /ประกันบำนาญ|pension insurance|annuity/ },
  { key: 'health_insurance', re: /ประกันสุขภาพ|health insurance/ },
  { key: 'life_insurance', re: /ประกันชีวิต|life insurance/ },
  { key: 'social_security', re: /ประกันสังคม|social security|\bsso\b/ },
  { key: 'political_party', re: /พรรค|political party/ },
  { key: 'home_loan_interest', re: /ดอกเบี้ยบ้าน|ดอกเบี้ยเงินกู้บ้าน|home loan interest|mortgage interest/ },
  { key: 'donation', re: /บริจาค|donat|ทำบุญ/ },
];
const DEDUCTION_NOTES = {
  life_insurance: 'Only policies of 10 years or more count. Check the amount on your insurer\'s tax certificate.',
  health_insurance: 'Use the amount on your insurer\'s tax certificate.',
  parents_health_insurance: 'Use the amount on the insurer\'s tax certificate.',
  pension_insurance: 'Use the amount on your insurer\'s tax certificate.',
  social_security: 'Usually taken from your salary: the yearly total is on your 50 ทวิ.',
  political_party: 'Counts only with the party\'s receipt.',
  home_loan_interest: 'Only the interest counts, not the principal: use the bank\'s yearly interest certificate.',
  donation: 'Counts with a receipt, or through e-Donation. Temple and charity donations through e-Donation may count twice.',
};

// Fund type from a holding's symbol/name.
function fundType(h) {
  const s = `${h.symbol || ''} ${h.name || ''}`.toUpperCase();
  if (/ESGX/.test(s)) return 'esgx';
  if (/THAI\s*ESG|TESG/.test(s)) return 'thai_esg';
  if (/\bRMF\b|RMF/.test(s)) return 'rmf';
  return null;
}
const isThaiListed = (h) => /\.BK$/i.test(h.symbol || '') || h.currency === 'THB';

const stableId = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
const sourceRows = (rows) => rows.slice(0, 20).map((t) => ({ id: t.id, date: t.date, description: t.description || t.category_name || '', amount: round2(t.amount) }));
const monthsOf = (rows) => new Set(rows.map((t) => t.date.slice(0, 7)));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthSpan = (rows) => {
  const ms = [...monthsOf(rows)].sort();
  const label = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
  return ms.length === 1 ? label(ms[0]) : `${label(ms[0])}-${label(ms[ms.length - 1])}`;
};

// FIFO: each sell matched to the buy lots it consumed -> [{ sellDate, buyDate, qty, gain }]
function fifoMatches(lots) {
  const buys = [];
  const out = [];
  [...lots].sort((a, b) => (a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : (a.side === 'buy' ? -1 : 1))).forEach((l) => {
    const qty = Number(l.quantity);
    const price = Number(l.price);
    const fee = Number(l.fee || 0);
    if (l.side === 'buy') { buys.push({ date: l.trade_date, left: qty, unitCost: (qty * price + fee) / qty }); return; }
    let left = qty;
    const unitProceeds = (qty * price - fee) / qty;
    while (left > 1e-9 && buys.length) {
      const b = buys[0];
      const take = Math.min(left, b.left);
      out.push({ sellDate: l.trade_date, buyDate: b.date, qty: take, gain: take * (unitProceeds - b.unitCost) });
      b.left -= take;
      left -= take;
      if (b.left <= 1e-9) buys.shift();
    }
  });
  return out;
}

const yearsBetween = (a, b) => {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return yb - ya - (mb < ma || (mb === ma && db < da) ? 1 : 0);
};

// -> [{ id, target: 'income'|'claim', kind|key, amount, withheld?, creditRate?,
//       confidence, title, reason, note?, sources }]
function buildSuggestions({ year, rules, transactions = [], holdings = [], lotsByHolding = {}, dividends = null, today }) {
  const ce = year - 543;
  const inYear = (d) => d && d.slice(0, 4) === String(ce);
  const txns = transactions.filter((t) => inYear(t.date) && (t.type === 'income' || t.type === 'expense') && Number(t.amount) > 0);
  const out = [];
  const deductionKeys = new Set(rules.deductions.map((d) => d.key));
  const isCurrentYear = today && today.slice(0, 4) === String(ce);

  // ---- Income transactions ----
  const buckets = { salary: [], interest: [], dividend: [], rent: [], other: [] };
  txns.filter((t) => t.type === 'income').forEach((t) => {
    const rule = INCOME_RULES.find((r) => r.re.test(text(t)));
    buckets[rule ? rule.key : 'other'].push(t);
  });
  const sum = (rows) => round2(rows.reduce((s, t) => s + Number(t.amount), 0));

  if (buckets.salary.length) {
    const ytd = sum(buckets.salary);
    const months = monthsOf(buckets.salary).size;
    const lastMonth = Math.max(...buckets.salary.map((t) => Number(t.date.slice(5, 7))));
    let amount = ytd;
    let reason = `${buckets.salary.length} salary deposit${buckets.salary.length === 1 ? '' : 's'} (${monthSpan(buckets.salary)} ${year}) totalling ${ytd.toLocaleString('en-US')}.`;
    if (isCurrentYear && lastMonth < 12 && months >= 2) {
      const monthly = ytd / months;
      amount = round2(ytd + monthly * (12 - lastMonth));
      reason += ` Projected to December at about ${Math.round(monthly).toLocaleString('en-US')} a month.`;
    }
    out.push({
      id: stableId('income', 'salary'), target: 'income', kind: 'salary', amount, confidence: 'medium',
      title: 'Salary from your deposits', reason,
      note: 'Deposits are after tax, social security and provident fund, so your gross salary is higher. Use the figures on your 50 ทวิ when you have it.',
      sources: sourceRows(buckets.salary),
    });
  }
  if (buckets.interest.length) {
    const amt = sum(buckets.interest);
    out.push({
      id: stableId('income', 'interest'), target: 'income', kind: 'interest', amount: amt, confidence: 'low',
      title: 'Interest you received', reason: `${buckets.interest.length} interest payment${buckets.interest.length === 1 ? '' : 's'} (${monthSpan(buckets.interest)}).`,
      note: 'Savings interest up to 20,000 a year is tax-free, and banks withhold 15% above that (you can leave that interest out). Add it only if it was taxable.',
      sources: sourceRows(buckets.interest),
    });
  }
  const portfolioHasDividends = dividends && dividends.some((d) => d.received_thb > 0);
  if (buckets.dividend.length && !portfolioHasDividends) {
    const net = sum(buckets.dividend);
    const gross = round2(net / 0.9);
    out.push({
      id: stableId('income', 'dividend_tx'), target: 'income', kind: 'dividend_th', amount: gross, withheld: round2(gross - net), creditRate: 0.2, confidence: 'low',
      title: 'Dividends from your deposits', reason: `${buckets.dividend.length} dividend deposit${buckets.dividend.length === 1 ? '' : 's'} of ${net.toLocaleString('en-US')} after the 10% withheld (gross ${gross.toLocaleString('en-US')}).`,
      note: 'Optional: Thai dividends can stay out of your return (the 10% withheld is final). Add them when it lowers your tax.',
      sources: sourceRows(buckets.dividend),
    });
  }
  if (buckets.rent.length) {
    out.push({
      id: stableId('income', 'rent'), target: 'income', kind: 'rent_building', amount: sum(buckets.rent), confidence: 'low',
      title: 'Rent you received', reason: `${buckets.rent.length} rent payment${buckets.rent.length === 1 ? '' : 's'} (${monthSpan(buckets.rent)}).`,
      note: 'Shown as rent from a house or building (30% expenses). Change the type if it was land or a vehicle.',
      sources: sourceRows(buckets.rent),
    });
  }
  if (buckets.other.length) {
    out.push({
      id: stableId('income', 'other'), target: 'income', kind: 'freelance', amount: sum(buckets.other), confidence: 'low',
      title: 'Other income you logged', reason: `${buckets.other.length} other income entr${buckets.other.length === 1 ? 'y' : 'ies'} (${monthSpan(buckets.other)}).`,
      note: 'Shown as freelance income. Some of these may be refunds, gifts or money from friends, which aren\'t taxable: check before adding, and change the type if needed.',
      sources: sourceRows(buckets.other),
    });
  }

  // ---- Expense transactions -> deductions ----
  const byKey = {};
  txns.filter((t) => t.type === 'expense').forEach((t) => {
    const rule = EXPENSE_RULES.find((r) => r.re.test(text(t)));
    if (rule && deductionKeys.has(rule.key)) (byKey[rule.key] ||= []).push(t);
  });
  const fundBuys = { rmf: [], thai_esg: [], esgx: [] };
  for (const h of holdings) {
    const type = fundType(h);
    if (!type) continue;
    for (const l of lotsByHolding[h.id] || []) {
      if (l.side === 'buy' && inYear(l.trade_date)) fundBuys[type].push({ ...l, holding: h });
    }
  }
  for (const [key, rows] of Object.entries(byKey)) {
    const def = rules.deductions.find((d) => d.key === key);
    out.push({
      id: stableId('claim', key), target: 'claim', key, amount: sum(rows), confidence: key === 'donation' || key === 'home_loan_interest' ? 'low' : 'medium',
      title: def.label, reason: `${rows.length} payment${rows.length === 1 ? '' : 's'} in your transactions (${monthSpan(rows)}).`,
      note: DEDUCTION_NOTES[key], sources: sourceRows(rows),
    });
  }

  // ---- Fund purchases from portfolio lots ----
  const fundTargets = { rmf: 'rmf', thai_esg: 'thai_esg', esgx: deductionKeys.has('thai_esgx_new') ? 'thai_esgx_new' : null };
  for (const [type, lots] of Object.entries(fundBuys)) {
    const key = fundTargets[type];
    if (!lots.length || !key || !deductionKeys.has(key)) continue;
    const amount = round2(lots.reduce((s, l) => s + Number(l.quantity) * Number(l.price) + Number(l.fee || 0), 0));
    const names = [...new Set(lots.map((l) => l.holding.symbol))].join(', ');
    out.push({
      id: stableId('claim', key, 'lots'), target: 'claim', key, amount, confidence: 'high',
      title: rules.deductions.find((d) => d.key === key).label, reason: `${lots.length} purchase${lots.length === 1 ? '' : 's'} of ${names} in ${year} from your portfolio.`,
      note: type === 'rmf' ? 'Hold RMF at least 5 years and until age 55.' : 'Hold ThaiESG at least 5 years from each purchase.',
      sources: lots.slice(0, 20).map((l) => ({ id: l.id, date: l.trade_date, description: `Bought ${l.holding.symbol}`, amount: round2(Number(l.quantity) * Number(l.price) + Number(l.fee || 0)) })),
    });
  }

  // ---- RMF / ThaiESG sold within 5 years ----
  const breaches = [];
  for (const h of holdings) {
    const type = fundType(h);
    if (type !== 'rmf' && type !== 'thai_esg') continue;
    for (const m of fifoMatches(lotsByHolding[h.id] || [])) {
      if (inYear(m.sellDate) && yearsBetween(m.buyDate, m.sellDate) < 5) breaches.push({ ...m, holding: h, type });
    }
  }
  if (breaches.length) {
    const gain = round2(breaches.reduce((s, b) => s + b.gain, 0));
    const names = [...new Set(breaches.map((b) => b.holding.symbol))].join(', ');
    out.push({
      id: stableId('income', 'fund_breach'), target: 'income', kind: 'fund_gain_breach', amount: Math.max(gain, 0), confidence: 'high',
      title: 'Fund units sold before 5 years', reason: `You sold ${names} units bought less than 5 years earlier: ${gain >= 0 ? `a gain of ${gain.toLocaleString('en-US')}` : 'at a loss'}.`,
      note: 'Gains on units sold early are taxable, and the tax you saved when you bought them must be paid back (with a 1.5% monthly surcharge) by filing extra returns for those years.',
      warning: true,
      sources: breaches.slice(0, 20).map((b) => ({ id: null, date: b.sellDate, description: `Sold ${b.holding.symbol} (bought ${b.buyDate})`, amount: round2(b.gain) })),
    });
  }

  // ---- Portfolio dividends ----
  if (dividends) {
    const th = dividends.filter((d) => d.thai && !d.fund && d.received_thb > 0);
    const funds = dividends.filter((d) => d.thai && d.fund && d.received_thb > 0);
    const foreign = dividends.filter((d) => !d.thai && d.received_thb > 0);
    const add = (rows, kind, title, extra) => {
      if (!rows.length) return;
      const amount = round2(rows.reduce((s, d) => s + d.received_thb, 0));
      out.push({
        id: stableId('income', kind, 'portfolio'), target: 'income', kind, amount, confidence: 'high', title,
        reason: `From ${rows.map((d) => d.symbol).join(', ')} in your portfolio (ex-dates in ${year}).`,
        sources: rows.map((d) => ({ id: null, date: null, description: d.symbol, amount: round2(d.received_thb) })),
        ...extra(amount),
      });
    };
    add(th, 'dividend_th', 'Dividends from Thai shares', (a) => ({ withheld: round2(a * 0.1), creditRate: 0.2, note: 'Optional: the 10% withheld can be final. Add them when it lowers your tax (check the credit rate on each company\'s dividend notice).' }));
    add(funds, 'fund_distribution', 'Distributions from Thai ETFs and funds', (a) => ({ withheld: round2(a * 0.1), note: 'Optional: the 10% withheld can be final.' }));
    add(foreign, 'dividend_foreign', 'Dividends from foreign shares', () => ({ note: 'Taxable in Thailand when the money is brought in (rules since 2567). Foreign withholding isn\'t credited here.' }));
  }

  return out;
}

module.exports = { buildSuggestions, fifoMatches, fundType, INCOME_RULES, EXPENSE_RULES };
