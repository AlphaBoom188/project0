// LINE messages for per-bill group collection. Pure builders (no network).
//
// Layout follows the owner's KhunThong references (bill card, paid message,
// fully-paid and cancelled cards, reminder digest, fastest-payers board),
// styled by the app's UI rules: neutral surfaces, one accent (the LIFF
// --primary green), no emoji, no mascot. Every action button opens the LIFF
// app (liff.line.me/<LIFF_ID>?groupbill=<id> or ?group=<group id>).

const C = {
  primary: '#15803d',
  onPrimary: '#ffffff',
  onPrimaryMuted: '#dcfce7',
  foreground: '#0a0a0a',
  muted: '#737373',
  border: '#e5e5e5',
};

const baht = (n) => `฿${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const baht2 = (n) => `฿${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ORDINAL = ['1st', '2nd', '3rd'];
const ordinal = (n) => ORDINAL[n - 1] || `${n}th`;
const MAX_ROWS = 20;

function liffUrl(params) {
  const id = process.env.LIFF_ID || '';
  return `https://liff.line.me/${id}?${new URLSearchParams(params).toString()}`;
}
const billUrl = (billId) => liffUrl({ groupbill: billId });
const groupUrl = (groupId) => liffUrl({ group: groupId });

// Flex text must be non-empty.
const t = (text, extra = {}) => ({ type: 'text', text: String(text || ' '), wrap: true, ...extra });

const header = (kicker, big, sub) => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: C.primary,
  paddingAll: '16px',
  spacing: 'xs',
  contents: [
    t(kicker, { size: 'sm', weight: 'bold', color: C.onPrimary }),
    t(big, { size: 'xxl', weight: 'bold', color: C.onPrimary }),
    ...(sub ? [t(sub, { size: 'xs', color: C.onPrimaryMuted })] : []),
  ],
});

// name | tag | amount
const row = (name, amount, tag) => ({
  type: 'box',
  layout: 'horizontal',
  spacing: 'sm',
  contents: [
    t(name, { size: 'sm', color: C.foreground, flex: 6, wrap: false }),
    t(tag || ' ', { size: 'xs', color: C.primary, weight: 'bold', flex: 2, align: 'end', gravity: 'center' }),
    t(amount, { size: 'sm', color: C.foreground, flex: 3, align: 'end', weight: 'bold' }),
  ],
});

const linkButton = (label, uri) => ({ type: 'button', style: 'link', height: 'sm', color: C.primary, action: { type: 'uri', label, uri } });
const primaryButton = (label, uri) => ({ type: 'button', style: 'primary', height: 'sm', color: C.primary, action: { type: 'uri', label, uri } });
const separator = { type: 'separator', margin: 'md', color: C.border };

const more = (n) => (n > 0 ? [t(`and ${n} more`, { size: 'xs', color: C.muted })] : []);

const bubble = ({ headerBox, body, footer }) => ({
  type: 'bubble',
  ...(headerBox ? { header: headerBox } : {}),
  body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: body },
  ...(footer && footer.length ? { footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: footer } } : {}),
});

const flex = (altText, contents) => ({ type: 'flex', altText: altText.slice(0, 400), contents });

// ---- 1. Bill card ----
// bill: { id, description, amount }, ownerName, members: [{ name, share, isOwner, paid }]
function billCard({ bill, ownerName, members }) {
  const title = bill.description || 'Shared bill';
  const shown = members.slice(0, MAX_ROWS);
  return flex(`${title} ${baht(bill.amount)} requested by ${ownerName}`, bubble({
    headerBox: header(title, baht(bill.amount), `Requested by ${ownerName}`),
    body: [
      ...shown.map((m) => row(m.name, baht(m.share), m.isOwner ? 'Host' : m.paid ? 'Paid' : '')),
      ...more(members.length - shown.length),
      separator,
    ],
    footer: [linkButton('See who paid', billUrl(bill.id)), primaryButton('Pay', billUrl(bill.id))],
  }));
}

// ---- 2. "X paid" message (plain text, like a chat line) ----
function paidText({ payerName, ownerName, amount, billTitle, position, method, remaining }) {
  const how = method === 'slip' ? ' (slip confirmed)' : method === 'marked' ? ` (marked paid by ${ownerName})` : '';
  const status = remaining > 0 ? `${remaining} still to pay.` : 'Everyone has paid.';
  return { type: 'text', text: `${payerName} paid ${baht2(amount)} to ${ownerName}${how}\nBill "${billTitle || 'Shared bill'}": paid ${ordinal(position)}. ${status}` };
}

// ---- 3. Fully paid card ----
// payers: [{ name, share, position }] (owner excluded), in paid order
function fullyPaidCard({ bill, payers }) {
  const title = bill.description || 'Shared bill';
  const shown = payers.slice(0, MAX_ROWS);
  return flex(`${title}: fully paid`, bubble({
    headerBox: header(title, 'Fully paid', `${baht(bill.amount)} collected`),
    body: [
      ...shown.map((p) => row(p.name, baht(p.share), p.position <= 3 ? ordinal(p.position) : '')),
      ...more(payers.length - shown.length),
    ],
    footer: [primaryButton('View details', billUrl(bill.id))],
  }));
}

// ---- 4. Cancelled card ----
function cancelledCard({ bill, byName, unpaid }) {
  const title = bill.description || 'Shared bill';
  return flex(`Collection cancelled: ${title}`, bubble({
    body: [
      t('Collection cancelled', { size: 'lg', weight: 'bold', color: C.foreground }),
      t(title, { size: 'sm', color: C.muted }),
      t(`Cancelled by ${byName}`, { size: 'xs', color: C.muted }),
      separator,
      row('Bill total', baht(bill.amount)),
      row('Unpaid', baht(unpaid)),
      separator,
    ],
    footer: [linkButton('See who paid', billUrl(bill.id))],
  }));
}

// ---- 5. Reminder digest ----
// rows: [{ name, owed }]
function reminderCard({ groupId, openBills, rows }) {
  const shown = rows.slice(0, MAX_ROWS);
  return flex(`Don't forget to pay: ${openBills} open bill${openBills === 1 ? '' : 's'}`, bubble({
    body: [
      t("Don't forget to pay", { size: 'lg', weight: 'bold', color: C.foreground }),
      t(`${openBills} open bill${openBills === 1 ? '' : 's'}`, { size: 'xs', color: C.muted }),
      separator,
      ...shown.map((r) => row(r.name, baht(r.owed))),
      ...more(rows.length - shown.length),
      separator,
    ],
    footer: [linkButton('See all bills', groupUrl(groupId)), primaryButton('Pay', groupUrl(groupId))],
  }));
}

// ---- 6. Fastest payers board ----
// rows: [{ name, first, second, third }], topHostName, period label
function leaderboardCard({ groupId, period, rows, topHostName }) {
  const cell = (text, bold) => t(String(text), { size: 'sm', flex: 2, align: 'end', color: C.foreground, ...(bold ? { weight: 'bold' } : {}) });
  const headRow = {
    type: 'box', layout: 'horizontal', spacing: 'sm',
    contents: [t(' ', { flex: 6, size: 'xs' }), ...ORDINAL.map((o) => t(o, { size: 'xs', flex: 2, align: 'end', color: C.muted, weight: 'bold' }))],
  };
  const shown = rows.slice(0, 10);
  return flex(`Fastest payers, ${period}`, bubble({
    headerBox: header('Fastest payers', period),
    body: [
      ...(shown.length ? [headRow, ...shown.map((r) => ({
        type: 'box', layout: 'horizontal', spacing: 'sm',
        contents: [t(r.name, { size: 'sm', flex: 6, wrap: false, weight: 'bold', color: C.foreground }), cell(r.first), cell(r.second), cell(r.third)],
      }))] : [t('No payments yet this month.', { size: 'sm', color: C.muted })]),
      separator,
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        t('Top host', { size: 'sm', color: C.muted, flex: 4 }),
        t(topHostName || 'Nobody yet', { size: 'sm', weight: 'bold', color: C.foreground, flex: 6, align: 'end' }),
      ] },
    ],
    footer: [primaryButton('View bills', groupUrl(groupId))],
  }));
}

// "@Ann @Bo please pay" as a real LINE mention (textV2), so people get notified.
// ids: [line_user_id]. -> message or null when nobody to mention.
function mentionMessage(ids, suffix) {
  const list = [...new Set(ids)].slice(0, 20);
  if (!list.length) return null;
  const substitution = {};
  list.forEach((id, i) => { substitution[`m${i}`] = { type: 'mention', mentionee: { type: 'user', userId: id } }; });
  return { type: 'textV2', text: `${list.map((_, i) => `{m${i}}`).join(' ')} ${suffix}`, substitution };
}

module.exports = {
  billCard, paidText, fullyPaidCard, cancelledCard, reminderCard, leaderboardCard, mentionMessage,
  billUrl, groupUrl, ordinal, COLORS: C,
};
