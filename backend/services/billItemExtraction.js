const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000 });

// Separate from services/receiptExtraction.js on purpose: that path extracts a
// single total+category for recording one expense. This path extracts
// itemized line items so the creator can assign individual items to the
// people splitting the bill. No slip_hash dedup or thumbnail upload here --
// a bill split isn't itself a transaction, so there's nothing to dedupe against.
async function extractReceiptItems(imageBase64) {
  const prompt = `You are extracting line items from a restaurant/store receipt image for bill-splitting. Return ONLY a JSON object with these keys:
"merchant" (string, store/merchant name, or null if unreadable),
"items" (array of {"name": string, "amount": number}, one per distinct purchased item/dish; exclude tax and service charge from this array),
"tax" (number, tax amount, or 0 if none/unreadable),
"service_charge" (number, service charge amount, or 0 if none/unreadable),
"total" (number, the receipt's total amount, or null if unreadable).
Do not include any explanation or markdown, only the raw JSON object.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      },
    ],
  });

  const extracted = JSON.parse(completion.choices[0].message.content);
  const items = Array.isArray(extracted.items)
    ? extracted.items
        .filter((item) => item && typeof item.amount === 'number' && item.name)
        .map((item) => ({ name: String(item.name), amount: item.amount }))
    : [];

  return {
    merchant: extracted.merchant || null,
    items,
    tax: typeof extracted.tax === 'number' ? extracted.tax : 0,
    service_charge: typeof extracted.service_charge === 'number' ? extracted.service_charge : 0,
    total: typeof extracted.total === 'number' ? extracted.total : null,
  };
}

module.exports = { extractReceiptItems };
