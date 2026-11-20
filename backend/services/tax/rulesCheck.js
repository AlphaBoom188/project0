// The yearly tax-rules refresh guard (Tax Phase 6). Pure: given today and
// the rules registry, lists what's out of date. The job
// (jobs/taxRulesCheck.js) sends the list to the owner on LINE; the routine
// itself is in docs/TAX_RULES_REFRESH.md.
//
// Each January the year that just ended becomes the filing year: its rules
// must be checked against that year's RD booklets (no longer "carried
// over"), its online deadline set once the MOF announces it, and the new
// current year needs rules for planning.

function rulesIssues(today, getRules) {
  const [y, m] = today.split('-').map(Number);
  const currentBE = y + 543;
  const filingBE = currentBE - 1; // filed Jan-Apr of this year
  const issues = [];
  const current = getRules(currentBE);
  const filing = getRules(filingBE);
  if (!current) issues.push(`No rules for tax year ${currentBE} yet: people planning this year see ${filingBE}. Add rules/${currentBE}.js (start as a copy marked carriedOver).`);
  if (m <= 4) {
    if (!filing) issues.push(`No rules for tax year ${filingBE}, which people are filing now.`);
    else {
      if (filing.carriedOver) issues.push(`Tax year ${filingBE} still uses the ${filingBE - 1} rules. Check the RD's ${filingBE} booklets (Ins90/Ins91, usually out in December) and clear carriedOver.`);
      if (!filing.filing || !filing.filing.onlineDeadline) issues.push(`The online filing deadline for ${filingBE} isn't set (usually announced in January or February).`);
      const unverified = (filing.deductions || []).filter((d) => d.verified === false).map((d) => d.key);
      if (unverified.length) issues.push(`${unverified.length} ${filingBE} rule${unverified.length === 1 ? ' is' : 's are'} still unverified: ${unverified.join(', ')}.`);
    }
  }
  return issues;
}

module.exports = { rulesIssues };
