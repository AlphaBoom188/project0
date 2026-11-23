// Typhoon ASR rejects m4a/mp4 ("File type audio/mp4 not supported", QA run
// 2026-11-23), so voiceTranscription converts it to 16 kHz mono WAV with
// macOS afconvert first, and skips Typhoon when it can't. No network calls.
const fs = require('fs');
const path = require('path');
const { BACKEND, FIXTURES } = require('../lib');
const { toWav, typhoonInput } = require(`${BACKEND}/services/voiceTranscription.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const isWav = (b) => !!b && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WAVE';

(async () => {
  const m4a = fs.readFileSync(path.join(FIXTURES, 'voice_coffee_120_th.m4a'));
  const hasAfconvert = fs.existsSync('/usr/bin/afconvert');

  if (hasAfconvert) {
    const wav = await toWav(m4a, 'audio/mp4');
    assert(isWav(wav), 'm4a converts to a WAV file');
    // 16 kHz mono 16-bit: sample rate at byte 24, channels at byte 22.
    assert(wav && wav.readUInt32LE(24) === 16000 && wav.readUInt16LE(22) === 1, 'WAV is 16 kHz mono');
    const input = await typhoonInput(m4a, 'audio/x-m4a');
    assert(input && input.mimeType === 'audio/wav' && isWav(input.buffer), 'LINE m4a goes to Typhoon as WAV');
    const ios = await typhoonInput(m4a, 'audio/mp4;codecs=mp4a.40.2');
    assert(ios && ios.mimeType === 'audio/wav', 'iOS audio/mp4 with codecs goes to Typhoon as WAV');
  } else {
    assert(true, 'afconvert not on this machine: conversion checks skipped');
  }

  const wavIn = Buffer.from('RIFF0000WAVEfmt ');
  const passed = await typhoonInput(wavIn, 'audio/wav');
  assert(passed && passed.buffer === wavIn && passed.mimeType === 'audio/wav', 'WAV goes to Typhoon unchanged');
  assert((await typhoonInput(Buffer.from('x'), 'audio/webm;codecs=opus')) === null, 'webm skips Typhoon (OpenAI only)');
  assert((await toWav(m4a, 'audio/mp4', { convert: '/nonexistent/afconvert' })) === null, 'no converter: null, no throw');
  assert((await toWav(Buffer.from('not audio'), 'audio/mp4')) === null, 'garbage audio: null, no throw');

  const leftovers = fs.readdirSync(require('os').tmpdir()).filter((n) => n.startsWith('voice-'));
  assert(leftovers.length === 0, 'temp audio files are deleted');

  process.exit(failures ? 1 : 0);
})();
