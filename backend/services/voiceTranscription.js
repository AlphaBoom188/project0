const OpenAI = require('openai');
const { toFile } = require('openai');

// Speech-to-text for LINE voice messages (m4a/AAC) and the LIFF mic button
// (whatever the phone's MediaRecorder produces: audio/mp4 on iOS,
// audio/webm;codecs=opus on Android).
//
// 1. Typhoon ASR (SCB 10X, Thai-first), when TYPHOON_API_KEY is set. Its hosted
//    API is OpenAI-compatible (base https://api.opentyphoon.ai/v1, model
//    "typhoon-asr-realtime"). Its docs list wav/mp3/flac/ogg/opus but not m4a;
//    the m4a is sent as-is, and any rejection falls through to step 2.
//    The hosted API is a free, as-is beta that collects usage data (100 req/min).
// 2. OpenAI transcription with language 'th' (accepts m4a), using the existing
//    OPENAI_API_KEY. This is the only path when Typhoon isn't configured.
//
// Returns { text, provider }. Throws only if every configured provider fails.

const TYPHOON_BASE_URL = 'https://api.opentyphoon.ai/v1';
const TYPHOON_MODEL = 'typhoon-asr-realtime';
const OPENAI_MODEL = 'gpt-4o-mini-transcribe';

let typhoon = null;
let openai = null;
const typhoonClient = () =>
  (typhoon ||= new OpenAI({ apiKey: process.env.TYPHOON_API_KEY, baseURL: TYPHOON_BASE_URL, timeout: 20000, maxRetries: 0 }));
const openaiClient = () => (openai ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000, maxRetries: 1 }));

// MIME type -> the file extension the transcription APIs expect.
const EXTENSIONS = {
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'm4a',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};
const baseType = (mimeType) => String(mimeType || '').split(';')[0].trim().toLowerCase();
const isSupportedAudioType = (mimeType) => baseType(mimeType) in EXTENSIONS;

async function transcribeWith(client, model, buffer, mimeType, extra = {}) {
  const type = baseType(mimeType);
  const file = await toFile(buffer, `voice.${EXTENSIONS[type] || 'm4a'}`, { type: type || 'audio/mp4' });
  const result = await client.audio.transcriptions.create({ file, model, ...extra });
  return (result.text || '').trim();
}

async function transcribeVoice(buffer, { mimeType = 'audio/mp4' } = {}) {
  if (process.env.TYPHOON_API_KEY) {
    try {
      const text = await transcribeWith(typhoonClient(), TYPHOON_MODEL, buffer, mimeType);
      if (text) return { text, provider: 'typhoon' };
      console.warn('[voice] Typhoon returned an empty transcript; falling back to OpenAI');
    } catch (error) {
      console.warn(`[voice] Typhoon failed (${error.status || ''} ${error.message}); falling back to OpenAI`);
    }
  }
  const text = await transcribeWith(openaiClient(), OPENAI_MODEL, buffer, mimeType, { language: 'th' });
  return { text, provider: 'openai' };
}

module.exports = { transcribeVoice, isSupportedAudioType };
