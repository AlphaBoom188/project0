#!/usr/bin/env node
// Test runner. Suites are plain Node scripts that print "PASS: ..." / "FAIL: ..."
// lines and exit non-zero on failure; this runs them one at a time (they share
// the real Supabase project, so never in parallel) and summarizes.
//
//   npm test                  api + liff suites (free)
//   npm test -- bills         only suites whose path contains "bills"
//   npm run test:openai       suites that make real OpenAI calls (costs a few cents)
//   npm test -- -v            print every suite's full output
//
// Needs the backend running (npm start) -- suites go through the real HTTP API.
// The liff suites drive the installed Google Chrome via playwright-core.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { BASE } = require('./lib');

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const groupArg = args.find((a) => a.startsWith('--group='));
const groups = groupArg ? groupArg.slice('--group='.length).split(',') : ['api', 'liff'];
const filters = args.filter((a) => !a.startsWith('-'));

const suites = groups.flatMap((group) => {
  const dir = path.join(__dirname, group);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join(group, f));
}).filter((rel) => filters.length === 0 || filters.some((f) => rel.includes(f)));

(async () => {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    console.error(`Backend not reachable at ${BASE} (${error.message}). Start it first: npm start`);
    process.exit(1);
  }
  if (suites.length === 0) {
    console.error(`No suites matched (groups: ${groups.join(', ')}; filter: ${filters.join(' ') || 'none'}).`);
    process.exit(1);
  }

  const results = [];
  for (const rel of suites) {
    const started = Date.now();
    const run = spawnSync(process.execPath, [path.join(__dirname, rel)], { cwd: __dirname, encoding: 'utf8', timeout: 5 * 60 * 1000 });
    const out = `${run.stdout || ''}${run.stderr || ''}`;
    const passed = (out.match(/^PASS/gm) || []).length;
    const failedLines = out.split('\n').filter((l) => l.startsWith('FAIL'));
    const ok = run.status === 0 && failedLines.length === 0 && passed > 0;
    results.push({ rel, ok, passed, failed: failedLines.length });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${rel}  (${passed} passed${failedLines.length ? `, ${failedLines.length} failed` : ''}, ${secs}s)`);
    if (verbose) console.log(out.replace(/^/gm, '      '));
    else if (!ok) {
      const detail = failedLines.length ? failedLines : out.trim().split('\n').slice(-8);
      console.log(detail.map((l) => `      ${l}`).join('\n'));
      if (run.error) console.log(`      ${run.error.message}`);
    }
  }

  const failedSuites = results.filter((r) => !r.ok);
  const totalPassed = results.reduce((n, r) => n + r.passed, 0);
  console.log(`\n${results.length - failedSuites.length}/${results.length} suites passed, ${totalPassed} checks passed.`);
  process.exit(failedSuites.length ? 1 : 0);
})();
