const OpenAI = require('openai');
const supabase = require('../config/supabase');
const { fetchExpenseCategories, matchCategoryByName } = require('./categoryMatch');
const { uploadThumbnail } = require('./receiptThumbnail');
const { getUserPreferences } = require('./userPreferences');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000 });

// Returns the existing transaction row if this slip_hash was already recorded for this user, else null.
// Shared by the REST OCR endpoint and the LINE Bot image-message handler.
async function findDuplicateBySlipHash(lineUserId, slipHash) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, transaction_date, amount')
    .eq('line_user_id', lineUserId)
    .eq('slip_hash', slipHash)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// Resizes and uploads a thumbnail to private storage, honoring the user's preference.
// Non-fatal: a storage failure shouldn't block the whole scan, so this logs and
// returns null rather than throwing.
async function maybeUploadThumbnail(lineUserId, imageBase64) {
  try {
    const { saveReceiptThumbnails } = await getUserPreferences(lineUserId);
    if (!saveReceiptThumbnails) return null;
    return await uploadThumbnail(lineUserId, Buffer.from(imageBase64, 'base64'));
  } catch (error) {
    console.error('Error uploading receipt thumbnail:', error.message);
    return null;
  }
}

// Runs a receipt image through OpenAI Vision and returns extracted + category-matched fields.
async function extractReceiptFromImage(lineUserId, imageBase64) {
  const categories = await fetchExpenseCategories(lineUserId);
  const categoryNames = categories.map((c) => c.name);

  const prompt = `You are extracting data from a receipt/slip image. Return ONLY a JSON object with these keys:
"amount" (number, the total amount paid, or null if unreadable),
"date" (string in YYYY-MM-DD format, or null if unreadable),
"merchant" (string, the store/merchant name, or null if unreadable),
"category" (string, the single best match from this list: [${categoryNames.join(', ') || 'none available'}], or null if none fit well).
Do not include any explanation or markdown, only the raw JSON object.`;

  const [completion, thumbnailPath] = await Promise.all([
    openai.chat.completions.create({
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
    }),
    maybeUploadThumbnail(lineUserId, imageBase64),
  ]);

  const extracted = JSON.parse(completion.choices[0].message.content);
  const matchedCategory = matchCategoryByName(categories, extracted.category);

  return {
    amount: typeof extracted.amount === 'number' ? extracted.amount : null,
    date: extracted.date || null,
    merchant: extracted.merchant || null,
    suggested_category_id: matchedCategory ? matchedCategory.id : null,
    suggested_category_name: matchedCategory ? matchedCategory.name : (extracted.category || null),
    thumbnail_path: thumbnailPath,
  };
}

module.exports = { findDuplicateBySlipHash, extractReceiptFromImage };
