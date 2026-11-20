// Startup speed guards (2026-11-21: 4.0 s -> 2.0 s on a 1.6 Mbps / 150 ms
// link): responses are gzipped, versioned scripts/styles are cached for a
// year, pages revalidate, and Chart.js isn't loaded at startup.
const { BASE } = require('../lib');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const http = require('http');

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
// Raw GET (fetch would decompress and hide the encoding).
const raw = (p) => new Promise((resolve, reject) => {
  http.get(`${BASE}${p}`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  }).on('error', reject);
});

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'liff-app', 'index.html'), 'utf8');
  const v = /app\.js\?v=(\w+)/.exec(html)[1];
  const js = await raw(`/liff/app.js?v=${v}`);
  const size = fs.statSync(path.join(__dirname, '..', '..', '..', 'liff-app', 'app.js')).size;
  assert(js.headers['content-encoding'] === 'gzip' && zlib.gunzipSync(js.body).length === size && js.body.length < size / 2, `app.js is gzipped (${Math.round(js.body.length / 1024)} KB of ${Math.round(size / 1024)} KB)`);
  assert(js.headers['cache-control'] === 'public, max-age=31536000, immutable', 'versioned script cached for a year');
  const css = await raw(`/liff/style.css?v=${v}`);
  assert(css.headers['cache-control'].includes('immutable') && css.headers['content-encoding'] === 'gzip', 'versioned stylesheet cached and gzipped');
  const page = await raw('/liff/');
  assert(page.headers['cache-control'] === 'no-cache' && page.headers['content-encoding'] === 'gzip', 'the page revalidates every time (a deploy shows at once)');
  const unversioned = await raw('/liff/app.js');
  assert(unversioned.headers['cache-control'] === 'no-cache', 'an unversioned script is not cached long');
  assert((await raw('/liff-config.js')).headers['cache-control'] === 'no-cache', 'liff-config revalidates');
  assert(!/<script[^>]+Chart\.js/i.test(html), 'Chart.js is not a startup script (loaded on first chart)');
  const api = await raw('/health');
  assert(api.status === 200, 'API still answers');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
