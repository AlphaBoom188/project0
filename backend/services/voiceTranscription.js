const OpenAI = require('openai');
const { toFile } = require('openai');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Speech-to-text for LINE voice messages (m4a/AAC) and the LIFF mic button
// (whatever the phone's MediaRecorder produces: audio/mp4 on iOS,
// audio/webm;codecs=opus on Android).
//
// 1. Typhoon ASR (SCB 10X, Thai-first), when TYPHOON_API_KEY is set. Its hosted
//    API is OpenAI-compatible (base https://api.opentyphoon.ai/v1, model
//    "typhoon-asr-realtime"). It accepts only wav/mp3/flac/ogg/opus and rejects
//    m4a/mp4 with a 400, so anything else is first converted to 16 kHz mono WAV
//    with macOS's built-in afconvert (production self-hosts on a Mac). When that
//    isn't possible (webm from Android, a non-Mac host), Typhoon is skipped.
//    Any Typhoon failure falls through to step 2.
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

// What Typhoon takes as is, and what afconvert can decode (AAC in mp4/m4a).
const TYPHOON_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/ogg', 'audio/flac', 'audio/opus']);
const AFCONVERT_TYPES = new Set(['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac']);
const AFCONVERT = '/usr/bin/afconvert';

// m4a -> 16 kHz mono 16-bit WAV through temp files (afconvert can't pipe).
// The audio is deleted straight after; returns null if it can't convert.
async function toWav(buffer, mimeType, { convert = AFCONVERT } = {}) {
  if (!AFCONVERT_TYPES.has(baseType(mimeType))) return null;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-'));
  const id = crypto.randomBytes(6).toString('hex');
  const src = path.join(dir, `${id}.m4a`);
  const out = path.join(dir, `${id}.wav`);
  try {
    await fs.writeFile(src, buffer, { mode: 0o600 });
    await new Promise((resolve, reject) => {
      execFile(convert, ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', src, out], { timeout: 15000 }, (error) => (error ? reject(error) : resolve()));
    });
    return await fs.readFile(out);
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function typhoonInput(buffer, mimeType) {
  if (TYPHOON_TYPES.has(baseType(mimeType))) return { buffer, mimeType };
  const wav = await toWav(buffer, mimeType);
  return wav ? { buffer: wav, mimeType: 'audio/wav' } : null;
}

async function transcribeVoice(buffer, { mimeType = 'audio/mp4' } = {}) {
  const input = process.env.TYPHOON_API_KEY ? await typhoonInput(buffer, mimeType) : null;
  if (input) {
    try {
      const text = await transcribeWith(typhoonClient(), TYPHOON_MODEL, input.buffer, input.mimeType);
      if (text) return { text, provider: 'typhoon' };
      console.warn('[voice] Typhoon returned an empty transcript; falling back to OpenAI');
    } catch (error) {
      console.warn(`[voice] Typhoon failed (${error.status || ''} ${error.message}); falling back to OpenAI`);
    }
  }
  const text = await transcribeWith(openaiClient(), OPENAI_MODEL, buffer, mimeType, { language: 'th' });
  return { text, provider: 'openai' };
}

module.exports = { transcribeVoice, isSupportedAudioType, toWav, typhoonInput };
