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
const { spawn } = require('child_process');
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

// Each suite runs in its own process group, so a timeout also kills the
// Chrome it launched. (spawnSync's timeout killed only the Node process; the
// browser kept the output pipe open and the whole run stalled.)
const SUITE_TIMEOUT_MS = 5 * 60 * 1000;
function runSuite(rel) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, rel)], { cwd: __dirname, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const killGroup = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, SUITE_TIMEOUT_MS);
    child.on('exit', (status) => {
      clearTimeout(timer);
      killGroup(); // a browser the suite left behind
      // Let the pipes drain, but never wait on them for long.
      const done = () => resolve({ status: timedOut ? null : status, out, timedOut });
      const fallback = setTimeout(done, 2000);
      child.on('close', () => { clearTimeout(fallback); done(); });
    });
  });
}

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
    const run = await runSuite(rel);
    const out = run.out;
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
      if (run.timedOut) console.log(`      timed out after ${SUITE_TIMEOUT_MS / 60000} minutes`);
    }
  }

  const failedSuites = results.filter((r) => !r.ok);
  const totalPassed = results.reduce((n, r) => n + r.passed, 0);
  console.log(`\n${results.length - failedSuites.length}/${results.length} suites passed, ${totalPassed} checks passed.`);
  process.exit(failedSuites.length ? 1 : 0);
})();
