const supabase = require('../config/supabase');
const { transcribeVoice, isSupportedAudioType } = require('../services/voiceTranscription');
const { parseExpenseText } = require('../services/textExpenseParser');

// ~60 s of compressed speech is well under 1 MB; 3 MB leaves room for
// higher-bitrate recorders without accepting arbitrary uploads.
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

const voiceController = {
  // POST /api/voice/:line_user_id/parse
  // Body: { audio_base64, mime_type } -- a recording from the LIFF mic button.
  // Transcribes it (Typhoon, else OpenAI) and parses the transcript with the
  // same parser as LINE chat messages. Writes nothing: the LIFF form is
  // filled in for the user to review and save.
  async parse(req, res) {
    try {
      const { line_user_id } = req.params;
      const { audio_base64, mime_type } = req.body || {};
      if (typeof audio_base64 !== 'string' || !audio_base64) return res.status(400).json({ error: 'audio_base64 is required' });
      if (!isSupportedAudioType(mime_type)) return res.status(400).json({ error: 'Unsupported audio type' });
      const audio = Buffer.from(audio_base64, 'base64');
      if (audio.length === 0) return res.status(400).json({ error: 'Empty recording' });
      if (audio.length > MAX_AUDIO_BYTES) return res.status(413).json({ error: 'Recording too long. Keep it under a minute.' });

      const { data: user, error } = await supabase.from('users').select('line_user_id').eq('line_user_id', line_user_id).maybeSingle();
      if (error) throw error;
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { text, provider } = await transcribeVoice(audio, { mimeType: mime_type });
      if (!text) return res.status(422).json({ error: "I didn't catch anything. Try again, e.g. \"กาแฟ 120 บาท\"." });
      const parsed = await parseExpenseText(line_user_id, text);
      res.json({
        success: true,
        transcript: text,
        provider,
        expense: {
          is_expense: parsed.isExpense,
          amount: parsed.amount,
          description: parsed.description,
          category_id: parsed.suggestedCategoryId,
          category_name: parsed.suggestedCategoryId ? parsed.suggestedCategoryName : null,
        },
      });
    } catch (error) {
      console.error('Error in voice parse:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = voiceController;
