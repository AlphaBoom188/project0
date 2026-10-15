const OpenAI = require('openai');
const { fetchExpenseCategories, matchCategoryByName } = require('./categoryMatch');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15000 });

// Keyword -> category name hints, checked before spending an LLM call. These match
// against the user's actual preset category names (migration 004), so they only
// help while the user hasn't renamed or removed those presets -- that's fine, the
// LLM fallback below still covers renamed/custom categories.
const KEYWORD_HINTS = [
  { category: 'Food', keywords: ['coffee', 'lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'กาแฟ', 'ข้าว', 'อาหาร'] },
  { category: 'Transport', keywords: ['taxi', 'grab', 'uber', 'bts', 'mrt', 'bus', 'fuel', 'gas', 'parking', 'แท็กซี่', 'รถ'] },
  { category: 'Accommodation', keywords: ['hotel', 'rent', 'airbnb', 'motel', 'โรงแรม', 'ค่าเช่า'] },
  { category: 'Utilities', keywords: ['electric', 'water bill', 'internet', 'wifi', 'ไฟฟ้า', 'น้ำ'] },
  { category: 'Shopping', keywords: ['amazon', 'shopee', 'lazada', 'clothes', 'shoes', 'ซื้อของ'] },
  { category: 'Telecom', keywords: ['phone bill', 'sim', 'mobile plan', 'ค่าโทรศัพท์'] },
];

function keywordMatch(categories, description) {
  if (!description) return null;
  const lower = description.toLowerCase();
  for (const hint of KEYWORD_HINTS) {
    if (hint.keywords.some((k) => lower.includes(k))) {
      const match = matchCategoryByName(categories, hint.category);
      if (match) return match;
    }
  }
  return null;
}

async function llmMatch(categories, description) {
  const categoryNames = categories.map((c) => c.name);
  if (categoryNames.length === 0) return null;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `An expense was logged with this description: "${description}"
Return ONLY a JSON object: {"category": "<the single best match from this list: [${categoryNames.join(', ')}], or null if none fit well>"}`,
        },
      ],
    });
    const parsed = JSON.parse(completion.choices[0].message.content);
    return matchCategoryByName(categories, parsed.category);
  } catch (error) {
    console.error('Error in autoCategorize LLM fallback:', error.message);
    return null;
  }
}

// Infers the best expense category for a transaction description: cheap keyword
// matching first, an LLM call only when that doesn't find anything, and "Others"
// as a last resort so callers always get a usable category_id back rather than
// having to separately handle a null result.
async function autoCategorize(lineUserId, description) {
  const categories = await fetchExpenseCategories(lineUserId);

  const keywordResult = keywordMatch(categories, description);
  if (keywordResult) return keywordResult;

  const llmResult = await llmMatch(categories, description);
  if (llmResult) return llmResult;

  return matchCategoryByName(categories, 'Others');
}

module.exports = { autoCategorize };
