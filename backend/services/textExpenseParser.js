const OpenAI = require('openai');
const { fetchExpenseCategories, matchCategoryByName } = require('./categoryMatch');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000 });

// Parses a free-text chat message (e.g. "coffee 120") into a candidate expense.
// Returns isExpense: false when the message isn't a parseable expense entry.
async function parseExpenseText(lineUserId, text) {
  const categories = await fetchExpenseCategories(lineUserId);
  const categoryNames = categories.map((c) => c.name);

  const prompt = `A user sent this message to an expense tracker chatbot: "${text}"
If this message describes a single expense (an amount and optionally what it was for), return ONLY a JSON object with these keys:
"is_expense" (boolean, true only if this message clearly describes an expense with a numeric amount),
"amount" (number, the expense amount, or null),
"description" (string, a short description of what it was for, or null),
"category" (string, the single best match from this list: [${categoryNames.join(', ') || 'none available'}], or null if none fit well).
Do not include any explanation or markdown, only the raw JSON object.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });

  const extracted = JSON.parse(completion.choices[0].message.content);
  const matchedCategory = matchCategoryByName(categories, extracted.category);
  const amount = typeof extracted.amount === 'number' ? extracted.amount : null;

  return {
    isExpense: Boolean(extracted.is_expense) && amount !== null,
    amount,
    description: extracted.description || null,
    suggestedCategoryId: matchedCategory ? matchedCategory.id : null,
    suggestedCategoryName: matchedCategory ? matchedCategory.name : (extracted.category || null),
  };
}

module.exports = { parseExpenseText };
