const line = require('@line/bot-sdk');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
});

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
});

// The SDK's HTTP client exposes no timeout option, so a hung upstream call could
// otherwise block a webhook request indefinitely. Bound every outbound call here.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function replyText(replyToken, text) {
  await withTimeout(client.replyMessage({ replyToken, messages: [{ type: 'text', text }] }), 10000, 'replyMessage');
}

async function pushText(to, text) {
  await withTimeout(client.pushMessage({ to, messages: [{ type: 'text', text }] }), 10000, 'pushMessage');
}

// Up to 5 messages of any kind (flex cards, textV2 mentions) in one reply/push.
async function replyMessages(replyToken, messages) {
  await withTimeout(client.replyMessage({ replyToken, messages }), 10000, 'replyMessage');
}

async function pushMessages(to, messages) {
  await withTimeout(client.pushMessage({ to, messages }), 10000, 'pushMessage');
}

// Confirm/Cancel card for a parsed-but-unsaved transaction.
function buildConfirmationFlex({ title, rows, confirmData, cancelData, heroImageUrl }) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      ...(heroImageUrl
        ? { hero: { type: 'image', url: heroImageUrl, size: 'full', aspectRatio: '4:3', aspectMode: 'cover' } }
        : {}),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true },
          ...rows.map((row) => ({
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: row.label, size: 'sm', color: '#888888', flex: 2 },
              { type: 'text', text: row.value, size: 'sm', wrap: true, flex: 5 },
            ],
          })),
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: 'Cancel', data: cancelData, displayText: 'Cancel' },
          },
          {
            type: 'button',
            style: 'primary',
            action: { type: 'postback', label: 'Confirm', data: confirmData, displayText: 'Confirm' },
          },
        ],
      },
    },
  };
}

async function replyConfirmationCard(replyToken, options) {
  await withTimeout(client.replyMessage({ replyToken, messages: [buildConfirmationFlex(options)] }), 10000, 'replyMessage');
}

async function getImageBuffer(messageId) {
  const stream = await withTimeout(blobClient.getMessageContent(messageId), 10000, 'getMessageContent');
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Group/room member display name (works for members who never friended the
// Official Account). Null on any failure -- a name is nice-to-have.
async function getGroupMemberName(sourceType, groupId, userId) {
  try {
    const profile = await withTimeout(
      sourceType === 'room' ? client.getRoomMemberProfile(groupId, userId) : client.getGroupMemberProfile(groupId, userId),
      10000, 'getMemberProfile');
    return profile.displayName || null;
  } catch (error) {
    console.warn(`[line] member profile unavailable (${error.message})`);
    return null;
  }
}

async function getGroupName(groupId) {
  try {
    return (await withTimeout(client.getGroupSummary(groupId), 10000, 'getGroupSummary')).groupName || null;
  } catch (error) {
    console.warn(`[line] group summary unavailable (${error.message})`);
    return null;
  }
}

module.exports = { replyText, pushText, replyMessages, pushMessages, replyConfirmationCard, getImageBuffer, getGroupMemberName, getGroupName };
