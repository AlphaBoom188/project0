// Google OAuth used ONLY to obtain a verified email for CSV export -- NOT a
// login/identity method. LINE Login stays the sole way into the app (the
// Phase 2A decision to keep line_user_id as the real primary key is
// unchanged). See migration 013's header comment.
//
// Google actively blocks its OAuth consent screen inside embedded webviews
// (LINE's in-app browser included) -- error 403 disallowed_useragent. The
// LIFF frontend MUST open buildAuthUrl()'s result via liff.openWindow({ url, external: true })
// (the real system browser), not inline -- see liff-app/app.js's
// handleConnectGoogle().

function requireConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    const err = new Error(
      'Google export verification is not configured yet. Set GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET/GOOGLE_OAUTH_REDIRECT_URI in .env.'
    );
    err.notConfigured = true;
    throw err;
  }
  return { clientId, clientSecret, redirectUri };
}

// `state` carries the line_user_id through the redirect round-trip -- there's
// no session system in this app (same trusted-state-param pattern lineController.js
// already uses for LINE's own OAuth callback).
function buildAuthUrl(lineUserId) {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: lineUserId,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForVerifiedEmail(code) {
  const { clientId, clientSecret, redirectUri } = requireConfig();

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error(tokenBody.error_description || tokenBody.error || 'Google token exchange failed');
  }

  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const userInfo = await userInfoResponse.json().catch(() => ({}));
  if (!userInfoResponse.ok || !userInfo.email) {
    throw new Error('Could not fetch Google account info');
  }
  if (userInfo.email_verified !== true) {
    throw new Error('Google account email is not verified');
  }

  return userInfo.email;
}

module.exports = { buildAuthUrl, exchangeCodeForVerifiedEmail };
