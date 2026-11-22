// Static checks on liff-app/index.html: element ids are unique (a duplicate
// makes getElementById pick the wrong element, silently), every local script
// carries the same version tag (so LINE's webview fetches fresh files), and
// every script file exists.
const fs = require('fs');
const path = require('path');

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const dir = path.join(__dirname, '..', '..', '..', 'liff-app');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
assert(dupes.length === 0, `element ids are unique (duplicates: ${dupes.join(', ') || 'none'})`);
const local = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([a-z]+\.(?:js|css))\?v=([\w]+)"/g)];
assert(local.length >= 6 && new Set(local.map((m) => m[2])).size === 1, `one version tag on every local script and stylesheet (got ${[...new Set(local.map((m) => m[2]))]})`);
assert(local.every((m) => fs.existsSync(path.join(dir, m[1]))), 'every referenced file exists');
// Scripts in the expected order (each relies on the globals of the ones before).
const order = local.map((m) => m[1]).filter((f) => f.endsWith('.js'));
assert(order.join() === 'app.js,tasks.js,tax.js,insights.js,money.js,slips.js', `script order (got ${order})`);

// Feature files share app.js's globals: a second top-level declaration of
// the same name silently replaces the first (function) or throws (const/let).
const owners = new Map();
for (const file of order) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const m of src.matchAll(/^(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/gm)) {
    const name = m[1] || m[2];
    owners.set(name, [...(owners.get(name) || []), file]);
  }
}
const clashes = [...owners].filter(([, files]) => files.length > 1).map(([n, files]) => `${n} (${files.join(', ')})`);
assert(clashes.length === 0, `no top-level name is declared twice across the LIFF scripts (got ${clashes.join('; ') || 'none'})`);

process.exit(failures ? 1 : 0);
