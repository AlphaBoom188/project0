// POST /api/voice/:u/parse -- validation only (every case here is rejected
// before any transcription call, so it's free). The real-audio path is in
// tests/openai/voice_message.test.js.
const { BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = `test_voice_ep_${Date.now()}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const post = (u, body) => fetch(`${BASE}/api/voice/${u}/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const audio = Buffer.from('not really audio but long enough').toString('base64');

(async () => {
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: U, display_name: 'Voice EP' }) });
  assert((await post(U, { mime_type: 'audio/mp4' })).status === 400, 'missing audio_base64 -> 400');
  assert((await post(U, { audio_base64: audio, mime_type: 'video/mp4' })).status === 400, 'non-audio type -> 400');
  assert((await post(U, { audio_base64: audio })).status === 400, 'missing mime_type -> 400');
  assert((await post(U, { audio_base64: '', mime_type: 'audio/webm' })).status === 400, 'empty audio -> 400');
  const big = await post(U, { audio_base64: Buffer.alloc(3 * 1024 * 1024 + 10).toString('base64'), mime_type: 'audio/webm;codecs=opus' });
  assert(big.status === 413 && /under a minute/.test(big.body.error), 'over 3 MB -> 413 "under a minute"');
  assert((await post(`test_voice_nobody_${Date.now()}`, { audio_base64: audio, mime_type: 'audio/mp4' })).status === 404, 'unknown user -> 404');
  for (const t of ['categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); for (const t of ['categories', 'users']) await db.from(t).delete().eq('line_user_id', U); process.exit(1); });
