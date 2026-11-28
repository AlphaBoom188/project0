// The rich menu definition (config/richmenu.js) and its images: no network.
// Areas tile the image with no gaps or overlaps, every uri is a LIFF link,
// every postback is one the webhook handles, images are 2500x1686 PNGs < 1 MB.
const fs = require('fs');
const { BACKEND } = require('../lib');
const { buildMenus, WIDTH, HEIGHT } = require(`${BACKEND}/config/richmenu.js`);
const { MENU_POSTBACKS } = require(`${BACKEND}/controllers/lineMenuHandler.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };

const menus = buildMenus('1234567890-abcdefgh', '202611280000');
assert(menus.map((m) => m.alias).join() === 'money,tasks', 'two menus, aliases money and tasks');
for (const m of menus) {
  const { areas, size } = m.body;
  assert(size.width === WIDTH && size.height === HEIGHT && m.body.selected === true && m.body.chatBarText === 'Menu', `${m.key}: size, selected, chat bar text`);
  assert(m.body.name.startsWith('expense-tracker-') && m.body.name.length <= 300, `${m.key}: name prefix`);
  assert(areas.length === 8, `${m.key}: 8 areas (2 tabs + 6 cells)`);
  // Every pixel covered exactly once (sampled on a 10px grid).
  let gaps = 0; let overlaps = 0;
  for (let y = 5; y < HEIGHT; y += 10) for (let x = 5; x < WIDTH; x += 10) {
    const n = areas.filter(({ bounds: b }) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height).length;
    if (n === 0) gaps += 1; if (n > 1) overlaps += 1;
  }
  assert(gaps === 0 && overlaps === 0, `${m.key}: areas tile the image (gaps ${gaps}, overlaps ${overlaps})`);
  assert(areas.slice(0, 2).every((a) => a.action.type === 'richmenuswitch') && areas[0].action.richMenuAliasId === 'money' && areas[1].action.richMenuAliasId === 'tasks', `${m.key}: tab strip switches to money / tasks`);
  const uris = areas.filter((a) => a.action.type === 'uri').map((a) => a.action.uri);
  assert(uris.every((u) => u.startsWith('https://liff.line.me/1234567890-abcdefgh')), `${m.key}: every uri opens the LIFF app`);
  const posts = areas.filter((a) => a.action.type === 'postback');
  assert(posts.every((a) => MENU_POSTBACKS.includes(new URLSearchParams(a.action.data).get('menu')) && a.action.displayText), `${m.key}: postbacks are handled and show text`);
  assert(areas.every((a) => !a.action.label || a.action.label.length <= 20), `${m.key}: labels within LINE's 20 chars`);
  const png = fs.readFileSync(m.image);
  assert(png.length < 1024 * 1024 && png.readUInt32BE(16) === WIDTH && png.readUInt32BE(20) === HEIGHT, `${m.key}: image is ${WIDTH}x${HEIGHT} and under 1 MB (${png.length} bytes)`);
}
const money = menus[0].body.areas.map((a) => a.action.uri || a.action.data);
assert(money.includes('https://liff.line.me/1234567890-abcdefgh?action=add') && money.includes('menu=scan') && money.includes('menu=summary'), 'money cells: add, scan, summary');
const tasks = menus[1].body.areas.map((a) => a.action.uri || a.action.data);
assert(tasks.includes('https://liff.line.me/1234567890-abcdefgh?tab=tasks&action=note') && tasks.includes('menu=today') && tasks.includes('https://liff.line.me/1234567890-abcdefgh?tab=more&open=groups'), 'tasks cells: note, today, groups');
let threw = false; try { buildMenus('', 'x'); } catch { threw = true; }
assert(threw, 'missing LIFF_ID is a clear error');
process.exit(failures ? 1 : 0);
