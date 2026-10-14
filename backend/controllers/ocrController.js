const OpenAI = require('openai');
const supabase = require('../config/supabase');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ocrController = {
  // Scan a receipt/slip image, extract transaction details, and check for duplicates
  async scanReceipt(req, res) {
    try {
      const { line_user_id } = req.params;
      const { image_base64, slip_hash } = req.body;

      if (!image_base64) {
        return res.status(400).json({ error: 'image_base64 is required' });
      }

      if (!slip_hash) {
        return res.status(400).json({ error: 'slip_hash is required' });
      }

      // Fail fast on a known duplicate before spending an OCR call
      const { data: existing, error: dupError } = await supabase
        .from('transactions')
        .select('id, transaction_date, amount')
        .eq('line_user_id', line_user_id)
        .eq('slip_hash', slip_hash)
        .maybeSingle();

      if (dupError) throw dupError;

      if (existing) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: 'This receipt has already been recorded.',
          existing_transaction: existing,
        });
      }

      // Pull the user's expense categories so the model can suggest a real match
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('line_user_id', line_user_id)
        .eq('type', 'expense');

      if (catError) throw catError;

      const categoryNames = (categories || []).map((c) => c.name);

      const prompt = `You are extracting data from a receipt/slip image. Return ONLY a JSON object with these keys:
"amount" (number, the total amount paid, or null if unreadable),
"date" (string in YYYY-MM-DD format, or null if unreadable),
"merchant" (string, the store/merchant name, or null if unreadable),
"category" (string, the single best match from this list: [${categoryNames.join(', ') || 'none available'}], or null if none fit well).
Do not include any explanation or markdown, only the raw JSON object.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
            ],
          },
        ],
      });

      const extracted = JSON.parse(completion.choices[0].message.content);

      const matchedCategory = (categories || []).find(
        (c) => c.name.toLowerCase() === String(extracted.category || '').toLowerCase()
      );

      res.json({
        success: true,
        duplicate: false,
        data: {
          amount: typeof extracted.amount === 'number' ? extracted.amount : null,
          date: extracted.date || null,
          merchant: extracted.merchant || null,
          suggested_category_id: matchedCategory ? matchedCategory.id : null,
          suggested_category_name: matchedCategory ? matchedCategory.name : (extracted.category || null),
        },
      });
    } catch (error) {
      console.error('Error in scanReceipt:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = ocrController;
