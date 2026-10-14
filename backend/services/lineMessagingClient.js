const line = require('@line/bot-sdk');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
});

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
});

async function replyText(replyToken, text) {
  await client.replyMessage({ replyToken, messages: [{ type: 'text', text }] });
}

async function pushText(to, text) {
  await client.pushMessage({ to, messages: [{ type: 'text', text }] });
}

// Confirm/Cancel card for a parsed-but-unsaved transaction.
function buildConfirmationFlex({ title, rows, confirmData, cancelData }) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
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
  await client.replyMessage({ replyToken, messages: [buildConfirmationFlex(options)] });
}

async function getImageBuffer(messageId) {
  const stream = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { replyText, pushText, replyConfirmationCard, getImageBuffer };
