// LINE rich menu: two tabs (Money, Tasks) switched with rich menu aliases.
// Deployed by `node scripts/richmenu.js deploy` (never at server start).
// Images: backend/assets/richmenu/<key>.png, 2500x1686, under 1 MB.
// Layout: a tab strip (y 0-220, two halves) over a 3x2 grid (columns
// 834/833/833, rows 733).
const path = require('path');

const WIDTH = 2500;
const HEIGHT = 1686;
const STRIP = 220;
const COLS = [[0, 834], [834, 833], [1667, 833]];
const ROWS = [[STRIP, 733], [STRIP + 733, 733]];

const liffUrl = (liffId, query = '') => `https://liff.line.me/${liffId}${query ? `?${query}` : ''}`;
const uri = (label, liffId, query) => ({ type: 'uri', label, uri: liffUrl(liffId, query) });
const postback = (label, menu, displayText) => ({ type: 'postback', label, data: `menu=${menu}`, displayText });

// Cells left to right, top to bottom.
function cells(liffId) {
  return {
    money: [
      uri('Add entry', liffId, 'action=add'),
      postback('Scan receipt', 'scan', 'Scan a receipt'),
      uri('Speak', liffId, 'action=voice'),
      uri('Import slips', liffId, 'action=slips'),
      postback('Summary', 'summary', 'Summary'),
      uri('Open app', liffId),
    ],
    tasks: [
      uri('Add reminder', liffId, 'tab=tasks&action=add'),
      postback('Today', 'today', 'Today'),
      uri('Quick note', liffId, 'tab=tasks&action=note'),
      uri('To-do list', liffId, 'tab=tasks'),
      uri('Bills and groups', liffId, 'tab=groups'),
      uri('Open app', liffId),
    ],
  };
}

const MENU_KEYS = ['money', 'tasks']; // money is the default
const DEFAULT_MENU = 'money';
const NAME_PREFIX = 'expense-tracker-';

// -> [{ key, alias, image, body }] ready for POST /v2/bot/richmenu.
function buildMenus(liffId, stamp) {
  if (!liffId) throw new Error('LIFF_ID is not set');
  const all = cells(liffId);
  return MENU_KEYS.map((key) => {
    const areas = [
      { bounds: { x: 0, y: 0, width: WIDTH / 2, height: STRIP }, action: { type: 'richmenuswitch', label: 'Money', richMenuAliasId: 'money', data: 'tab=money' } },
      { bounds: { x: WIDTH / 2, y: 0, width: WIDTH / 2, height: STRIP }, action: { type: 'richmenuswitch', label: 'Tasks', richMenuAliasId: 'tasks', data: 'tab=tasks' } },
    ];
    all[key].forEach((action, i) => {
      const [x, width] = COLS[i % 3];
      const [y, height] = ROWS[Math.floor(i / 3)];
      areas.push({ bounds: { x, y, width, height }, action });
    });
    return {
      key,
      alias: key,
      image: path.join(__dirname, '..', 'assets', 'richmenu', `${key}.png`),
      body: { size: { width: WIDTH, height: HEIGHT }, selected: true, name: `${NAME_PREFIX}${key}-${stamp}`, chatBarText: 'Menu', areas },
    };
  });
}

module.exports = { buildMenus, MENU_KEYS, DEFAULT_MENU, NAME_PREFIX, WIDTH, HEIGHT, liffUrl };
