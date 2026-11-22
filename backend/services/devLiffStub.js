// Local QA only (docs/QA.md): a stub LINE SDK so a plain browser (e.g. the
// Playwright MCP) can open the LIFF app as a test_ user without LINE.
// Active only when DEV_LIFF_STUB=1, the request is direct loopback (no proxy
// headers) and devuser is a test_ id; anything else falls through to the
// untouched static files (or 404 for the stub script). API calls then use the
// existing loopback test_ bypass in services/lineAuth.js; no new auth bypass.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { isDirectLoopback } = require('./lineAuth');

const LINE_SDK_TAG = '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>';
const DEV_USER = /^test_[a-z0-9_]{1,40}$/;
const INDEX = path.join(__dirname, '../../liff-app/index.html');

function allowed(req, user) {
  return process.env.DEV_LIFF_STUB === '1' && isDirectLoopback(req) && DEV_USER.test(String(user || ''));
}

const router = express.Router();

router.get(['/liff/', '/liff/index.html'], (req, res, next) => {
  if (req.query.devuser === undefined || !allowed(req, req.query.devuser)) return next();
  const html = fs.readFileSync(INDEX, 'utf8');
  if (html.split(LINE_SDK_TAG).length !== 2) return next(); // the tag changed: serve the real page
  const tag = `<script src="/liff-dev-sdk.js?u=${encodeURIComponent(req.query.devuser)}"></script>`;
  res.set('Cache-Control', 'no-store').type('html').send(html.replace(LINE_SDK_TAG, tag));
});

router.get('/liff-dev-sdk.js', (req, res) => {
  if (!allowed(req, req.query.u)) return res.status(404).send('Not found');
  const u = JSON.stringify(req.query.u);
  res.set('Cache-Control', 'no-store').type('application/javascript').send(`window.liff = {
  init: async () => {}, isLoggedIn: () => true, login() {}, logout() {},
  getIDToken: () => 'dev', openWindow({ url }) { window.open(url, '_blank'); },
  isApiAvailable: () => false, isInClient: () => false,
  getProfile: async () => ({ userId: ${u}, displayName: 'QA User', pictureUrl: '' }),
};
`);
});

function logBoot() {
  if (process.env.DEV_LIFF_STUB !== '1') return;
  console.log('DEV LIFF STUB ON — local QA only');
  if (process.env.AUTH_TEST_BYPASS === 'false') console.warn('[dev-liff] DEV_LIFF_STUB=1 with AUTH_TEST_BYPASS=false: the stub user cannot sign in to the API.');
}

module.exports = { router, allowed, logBoot, LINE_SDK_TAG };
