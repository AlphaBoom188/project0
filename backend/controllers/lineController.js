const axios = require('axios');
const { upsertUser } = require('../services/userUpsert');

const lineController = {
  // Generate LINE Login URL
  getLoginUrl(req, res) {
    try {
      const { state } = req.query;
      const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
      const redirectUri = encodeURIComponent(process.env.LINE_LOGIN_REDIRECT_URI || 'http://localhost:3000/api/line/callback');

      const loginUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${state}&scope=profile%20openid%20email&nonce=random`;

      res.json({ success: true, login_url: loginUrl });
    } catch (error) {
      console.error('Error in getLoginUrl:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Handle LINE Login callback
  async handleCallback(req, res) {
    try {
      const { code, state } = req.query;

      if (!code) {
        return res.status(400).json({ error: 'Authorization code is required' });
      }

      const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
      const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
      const redirectUri = process.env.LINE_LOGIN_REDIRECT_URI || 'http://localhost:3000/api/line/callback';

      // Exchange authorization code for access token
      const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, id_token } = tokenResponse.data;

      // Get user profile
      const profileResponse = await axios.get('https://api.line.me/v2/profile', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const { userId, displayName, pictureUrl } = profileResponse.data;

      // Create or update user in database
      const user = await upsertUser({ lineUserId: userId, displayName, pictureUrl });

      res.json({
        success: true,
        user,
        access_token,
      });
    } catch (error) {
      console.error('Error in handleCallback:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Verify LINE access token
  async verifyToken(req, res) {
    try {
      const { access_token } = req.body;

      if (!access_token) {
        return res.status(400).json({ error: 'access_token is required' });
      }

      const response = await axios.post('https://api.line.me/oauth2/v2.1/verify', {
        access_token,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      console.error('Error in verifyToken:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Logout (revoke token)
  async logout(req, res) {
    try {
      const { access_token } = req.body;

      if (!access_token) {
        return res.status(400).json({ error: 'access_token is required' });
      }

      await axios.post('https://api.line.me/oauth2/v2.1/revoke', {
        access_token,
        client_id: process.env.LINE_LOGIN_CHANNEL_ID,
        client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Error in logout:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = lineController;
