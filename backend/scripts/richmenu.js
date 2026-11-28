#!/usr/bin/env node
// LINE rich menu (config/richmenu.js) through the Messaging API.
//   node scripts/richmenu.js deploy   create both menus, upload images, point the
//                                     aliases at them, set Money as default, then
//                                     delete older expense-tracker-* menus
//   node scripts/richmenu.js status   list menus, aliases and the default
//   node scripts/richmenu.js remove   unset the default, delete aliases and menus
//   node scripts/richmenu.js urls     print every cell's link or postback (no network)
// Idempotent: running deploy twice leaves exactly two menus and two aliases.
// Images can't be replaced on an existing menu, so deploy always creates new ones.
// Never run from tests or at server start.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { buildMenus, DEFAULT_MENU, NAME_PREFIX } = require('../config/richmenu');

const TOKEN = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';

async function call(method, url, { json, body, contentType } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(json ? { 'Content-Type': 'application/json' } : {}), ...(contentType ? { 'Content-Type': contentType } : {}) },
    body: json ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${url.replace(API, '').replace(DATA_API, '')} -> ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

const listMenus = async () => (await call('GET', `${API}/richmenu/list`)).richmenus || [];
const listAliases = async () => (await call('GET', `${API}/richmenu/alias/list`)).aliases || [];
const getDefault = () => call('GET', `${API}/user/all/richmenu`).then((r) => r.richMenuId, (e) => (e.status === 404 ? null : Promise.reject(e)));

async function deploy() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  const menus = buildMenus(process.env.LIFF_ID, stamp);
  for (const m of menus) {
    const size = fs.statSync(m.image).size;
    if (size > 1024 * 1024) throw new Error(`${m.image} is ${size} bytes; LINE allows 1 MB`);
  }
  const before = await listMenus();
  const aliases = new Set((await listAliases()).map((a) => a.richMenuAliasId));
  const created = {};
  for (const m of menus) {
    const { richMenuId } = await call('POST', `${API}/richmenu`, { json: m.body });
    await call('POST', `${DATA_API}/richmenu/${richMenuId}/content`, { body: fs.readFileSync(m.image), contentType: 'image/png' });
    created[m.key] = richMenuId;
    console.log(`created ${m.body.name} (${richMenuId})`);
  }
  for (const m of menus) {
    const id = created[m.key];
    if (aliases.has(m.alias)) await call('POST', `${API}/richmenu/alias/${m.alias}`, { json: { richMenuId: id } });
    else await call('POST', `${API}/richmenu/alias`, { json: { richMenuAliasId: m.alias, richMenuId: id } });
    console.log(`alias ${m.alias} -> ${id}`);
  }
  await call('POST', `${API}/user/all/richmenu/${created[DEFAULT_MENU]}`);
  console.log(`default -> ${DEFAULT_MENU}`);
  const keep = new Set(Object.values(created));
  for (const old of before) {
    if (old.name.startsWith(NAME_PREFIX) && !keep.has(old.richMenuId)) {
      await call('DELETE', `${API}/richmenu/${old.richMenuId}`);
      console.log(`deleted old ${old.name}`);
    }
  }
}

async function status() {
  const [menus, aliases, def] = await Promise.all([listMenus(), listAliases(), getDefault()]);
  console.log(`menus (${menus.length}):`);
  for (const m of menus) console.log(`  ${m.richMenuId}  ${m.name}${m.richMenuId === def ? '  [default]' : ''}`);
  console.log(`aliases (${aliases.length}):`);
  for (const a of aliases) console.log(`  ${a.richMenuAliasId} -> ${a.richMenuId}`);
  if (!def) console.log('no default menu set');
}

async function remove() {
  const def = await getDefault();
  const menus = (await listMenus()).filter((m) => m.name.startsWith(NAME_PREFIX));
  const ours = new Set(menus.map((m) => m.richMenuId));
  if (def && ours.has(def)) { await call('DELETE', `${API}/user/all/richmenu`); console.log('default unset'); }
  for (const a of await listAliases()) {
    if (ours.has(a.richMenuId)) { await call('DELETE', `${API}/richmenu/alias/${a.richMenuAliasId}`); console.log(`alias ${a.richMenuAliasId} deleted`); }
  }
  for (const m of menus) { await call('DELETE', `${API}/richmenu/${m.richMenuId}`); console.log(`deleted ${m.name}`); }
}

async function urls() {
  for (const m of buildMenus(process.env.LIFF_ID, 'preview')) {
    for (const a of m.body.areas) console.log(`${m.key.padEnd(6)} ${a.action.label.padEnd(17)} ${a.action.uri || a.action.data || `alias ${a.action.richMenuAliasId}`}`);
  }
}

const cmd = process.argv[2];
const run = { deploy, status, remove, urls }[cmd];
if (!run) {
  console.error('usage: node scripts/richmenu.js deploy|status|remove|urls');
  process.exit(2);
}
if (!TOKEN && cmd !== 'urls') {
  console.error('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN is not set (backend/.env)');
  process.exit(2);
}
run().catch((e) => { console.error(`richmenu ${cmd} failed: ${e.message}`); process.exit(1); });
